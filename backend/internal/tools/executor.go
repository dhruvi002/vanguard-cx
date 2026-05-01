package tools

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math/rand"
	"strings"
	"time"
)

// ToolResult is returned by every tool call
type ToolResult struct {
	ToolName   string          `json:"tool_name"`
	Input      json.RawMessage `json:"input"`
	Output     interface{}     `json:"output"`
	Success    bool            `json:"success"`
	DurationMs int64           `json:"duration_ms"`
	Error      string          `json:"error,omitempty"`
}

type Executor struct {
	db *sql.DB
}

func NewExecutor(db *sql.DB) *Executor {
	return &Executor{db: db}
}

// Execute dispatches to the correct tool and records timing
func (e *Executor) Execute(toolName string, inputJSON string) *ToolResult {
	start := time.Now()
	var input map[string]interface{}
	json.Unmarshal([]byte(inputJSON), &input)

	raw, _ := json.Marshal(input)
	result := &ToolResult{
		ToolName: toolName,
		Input:    raw,
	}

	var output interface{}
	var err error

	switch toolName {
	case "sql:orders_db":
		output, err = e.queryOrdersDB(input)
	case "sql:billing_db":
		output, err = e.queryBillingDB(input)
	case "sql:users_db":
		output, err = e.queryUsersDB(input)
	case "shipping_api.track":
		output, err = e.callShippingAPI(input)
	case "shipping_api.create_return":
		output, err = e.callReturnsAPI(input)
	case "stripe_api.refund":
		output, err = e.callStripeRefund(input)
	case "auth_api.send_reset":
		output, err = e.callAuthAPI(input)
	case "auth_api.unlock_account":
		output, err = e.callUnlockAccount(input)
	case "classifier":
		output, err = e.classifyIntent(input)
	default:
		err = fmt.Errorf("unknown tool: %s", toolName)
	}

	result.DurationMs = time.Since(start).Milliseconds()
	if err != nil {
		result.Success = false
		result.Error = err.Error()
		result.Output = map[string]string{"error": err.Error()}
	} else {
		result.Success = true
		result.Output = output
	}
	return result
}

// --- SQL Tools ---

func (e *Executor) queryOrdersDB(input map[string]interface{}) (interface{}, error) {
	simulateLatency(20, 60)

	customerID, _ := input["customer_id"].(string)
	orderID, _ := input["order_id"].(string)

	var rows *sql.Rows
	var err error

	if orderID != "" {
		rows, err = e.db.Query(`
			SELECT o.id, o.customer_id, o.status, o.tracking_id, o.carrier,
				o.total_amount, o.items, o.shipped_at, o.delivered_at, o.created_at,
				c.email, c.name
			FROM orders o JOIN customers c ON o.customer_id=c.id
			WHERE o.id=?`, orderID)
	} else if customerID != "" {
		rows, err = e.db.Query(`
			SELECT o.id, o.customer_id, o.status, o.tracking_id, o.carrier,
				o.total_amount, o.items, o.shipped_at, o.delivered_at, o.created_at,
				c.email, c.name
			FROM orders o JOIN customers c ON o.customer_id=c.id
			WHERE o.customer_id=? ORDER BY o.created_at DESC LIMIT 5`, customerID)
	} else {
		return nil, fmt.Errorf("must provide order_id or customer_id")
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var (
			id, custID, status, trackingID, carrier, items, email, name string
			totalAmount                                                   float64
			shippedAt, deliveredAt, createdAt                            sql.NullString
		)
		rows.Scan(&id, &custID, &status, &trackingID, &carrier, &totalAmount, &items, &shippedAt, &deliveredAt, &createdAt, &email, &name)
		results = append(results, map[string]interface{}{
			"order_id": id, "customer_id": custID, "status": status,
			"tracking_id": trackingID, "carrier": carrier, "total_amount": totalAmount,
			"items": items, "shipped_at": shippedAt.String, "delivered_at": deliveredAt.String,
			"created_at": createdAt.String, "customer_email": email, "customer_name": name,
		})
	}
	if len(results) == 0 {
		return map[string]interface{}{"found": false, "rows": []interface{}{}}, nil
	}
	return map[string]interface{}{"found": true, "rows": results}, nil
}

func (e *Executor) queryBillingDB(input map[string]interface{}) (interface{}, error) {
	simulateLatency(20, 50)

	customerID, _ := input["customer_id"].(string)
	if customerID == "" {
		return nil, fmt.Errorf("customer_id required")
	}

	rows, err := e.db.Query(`
		SELECT id, customer_id, amount, currency, description, status, refunded_at, created_at
		FROM charges WHERE customer_id=? ORDER BY created_at DESC LIMIT 10`, customerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var charges []map[string]interface{}
	for rows.Next() {
		var id, custID, currency, description, status string
		var amount float64
		var refundedAt, createdAt sql.NullString
		rows.Scan(&id, &custID, &amount, &currency, &description, &status, &refundedAt, &createdAt)
		charges = append(charges, map[string]interface{}{
			"charge_id": id, "amount": amount, "currency": currency,
			"description": description, "status": status,
			"refunded_at": refundedAt.String, "created_at": createdAt.String,
		})
	}

	// Detect duplicates
	amountCounts := map[float64]int{}
	for _, c := range charges {
		amountCounts[c["amount"].(float64)]++
	}
	duplicates := []map[string]interface{}{}
	for _, c := range charges {
		if amountCounts[c["amount"].(float64)] > 1 {
			duplicates = append(duplicates, c)
		}
	}

	return map[string]interface{}{
		"charges":          charges,
		"total_charges":    len(charges),
		"duplicate_groups": duplicates,
	}, nil
}

func (e *Executor) queryUsersDB(input map[string]interface{}) (interface{}, error) {
	simulateLatency(15, 40)

	email, _ := input["email"].(string)
	customerID, _ := input["customer_id"].(string)

	var row *sql.Row
	if email != "" {
		row = e.db.QueryRow(`SELECT id, email, name, plan, created_at FROM customers WHERE email=?`, email)
	} else if customerID != "" {
		row = e.db.QueryRow(`SELECT id, email, name, plan, created_at FROM customers WHERE id=?`, customerID)
	} else {
		return nil, fmt.Errorf("email or customer_id required")
	}

	var id, em, name, plan, createdAt string
	err := row.Scan(&id, &em, &name, &plan, &createdAt)
	if err == sql.ErrNoRows {
		// Simulate locked account for unknown users
		return map[string]interface{}{
			"found":           false,
			"account_locked":  true,
			"failed_attempts": 7,
			"locked_at":       time.Now().Add(-25 * time.Hour).Format(time.RFC3339),
		}, nil
	}
	if err != nil {
		return nil, err
	}

	// Randomly simulate locked state for demo
	locked := rand.Float32() < 0.3
	return map[string]interface{}{
		"found":          true,
		"customer_id":    id,
		"email":          em,
		"name":           name,
		"plan":           plan,
		"created_at":     createdAt,
		"account_locked": locked,
		"failed_attempts": func() int {
			if locked {
				return 7
			}
			return 0
		}(),
	}, nil
}

// --- External API Simulators ---

func (e *Executor) callShippingAPI(input map[string]interface{}) (interface{}, error) {
	simulateLatency(60, 200)

	// Simulate occasional carrier timeout
	if rand.Float32() < 0.05 {
		return nil, fmt.Errorf("carrier API timeout after 2000ms — upstream service unavailable")
	}

	trackingID, _ := input["tracking_id"].(string)
	if trackingID == "" {
		return nil, fmt.Errorf("tracking_id required")
	}

	statuses := []string{"in_transit", "out_for_delivery", "delivered", "delayed", "exception"}
	reasons := []string{"", "", "", "weather_hold", "address_exception"}
	idx := rand.Intn(len(statuses))

	eta := time.Now().Add(time.Duration(rand.Intn(5)+1) * 24 * time.Hour).Format("2006-01-02")

	result := map[string]interface{}{
		"tracking_id": trackingID,
		"status":      statuses[idx],
		"eta":         eta,
		"last_scan": map[string]interface{}{
			"location":  randomHub(),
			"timestamp": time.Now().Add(-time.Duration(rand.Intn(12)) * time.Hour).Format(time.RFC3339),
			"event":     "Package scanned at facility",
		},
	}
	if reasons[idx] != "" {
		result["reason"] = reasons[idx]
		result["delay_note"] = "Estimated delay: 1-2 business days"
	}
	return result, nil
}

func (e *Executor) callReturnsAPI(input map[string]interface{}) (interface{}, error) {
	simulateLatency(80, 300)

	// Higher failure rate for returns to show error handling in traces
	if rand.Float32() < 0.25 {
		return nil, fmt.Errorf("returns carrier API unavailable — retries exhausted (3/3)")
	}

	orderID, _ := input["order_id"].(string)
	returnID := fmt.Sprintf("RET-%d", rand.Intn(9000)+1000)
	labelURL := fmt.Sprintf("https://returns.vanguard-cx.io/labels/%s.pdf", returnID)

	return map[string]interface{}{
		"return_id":  returnID,
		"order_id":   orderID,
		"label_url":  labelURL,
		"carrier":    "UPS",
		"expires_at": time.Now().Add(30 * 24 * time.Hour).Format("2006-01-02"),
		"status":     "label_created",
	}, nil
}

func (e *Executor) callStripeRefund(input map[string]interface{}) (interface{}, error) {
	simulateLatency(100, 400)

	chargeID, _ := input["charge_id"].(string)
	amount, _ := input["amount"].(float64)

	if chargeID == "" {
		return nil, fmt.Errorf("charge_id required")
	}

	refundID := fmt.Sprintf("re_%s", randomString(10))
	return map[string]interface{}{
		"refund_id":  refundID,
		"charge_id":  chargeID,
		"amount":     amount,
		"currency":   "usd",
		"status":     "succeeded",
		"created_at": time.Now().Format(time.RFC3339),
		"balance_transaction": fmt.Sprintf("txn_%s", randomString(10)),
	}, nil
}

func (e *Executor) callAuthAPI(input map[string]interface{}) (interface{}, error) {
	simulateLatency(40, 120)

	email, _ := input["email"].(string)
	tokenID := fmt.Sprintf("tok_%s", randomString(12))

	return map[string]interface{}{
		"token":      tokenID,
		"email":      email,
		"expires_in": 1800,
		"sent_at":    time.Now().Format(time.RFC3339),
		"channel":    "email",
	}, nil
}

func (e *Executor) callUnlockAccount(input map[string]interface{}) (interface{}, error) {
	simulateLatency(30, 80)
	customerID, _ := input["customer_id"].(string)
	e.db.Exec(`UPDATE customers SET plan=plan WHERE id=?`, customerID) // no-op but records intent
	return map[string]interface{}{
		"success":      true,
		"customer_id":  customerID,
		"unlocked_at":  time.Now().Format(time.RFC3339),
		"reset_window": "30 minutes",
	}, nil
}

func (e *Executor) classifyIntent(input map[string]interface{}) (interface{}, error) {
	simulateLatency(10, 30)

	text, _ := input["text"].(string)
	text = strings.ToLower(text)

	category := "general"
	confidence := 0.85 + rand.Float64()*0.14

	switch {
	case containsAny(text, "order", "ship", "deliver", "track", "package"):
		category = "shipping"
	case containsAny(text, "charge", "bill", "refund", "payment", "duplicate", "invoice"):
		category = "billing"
	case containsAny(text, "password", "login", "account", "locked", "access", "reset"):
		category = "auth"
	case containsAny(text, "api", "key", "endpoint", "integration", "webhook"):
		category = "api"
	case containsAny(text, "return", "label", "wrong item", "exchange"):
		category = "returns"
	}

	agentMap := map[string]string{
		"shipping": "order-agent",
		"billing":  "billing-agent",
		"auth":     "auth-agent",
		"api":      "api-agent",
		"returns":  "returns-agent",
		"general":  "general-agent",
	}

	return map[string]interface{}{
		"category":   category,
		"agent":      agentMap[category],
		"confidence": confidence,
		"reasoning":  fmt.Sprintf("Detected keywords indicating %s issue", category),
	}, nil
}

// --- Helpers ---

func simulateLatency(minMs, maxMs int) {
	ms := minMs + rand.Intn(maxMs-minMs)
	time.Sleep(time.Duration(ms) * time.Millisecond)
}

func randomHub() string {
	hubs := []string{"Oakland CA", "Chicago IL", "Memphis TN", "Louisville KY", "Cincinnati OH", "Dallas TX", "Atlanta GA"}
	return hubs[rand.Intn(len(hubs))]
}

func randomString(n int) string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}

func containsAny(s string, words ...string) bool {
	for _, w := range words {
		if strings.Contains(s, w) {
			return true
		}
	}
	return false
}
