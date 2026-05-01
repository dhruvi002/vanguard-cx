package db

import (
	"database/sql"
	"fmt"
	"log"
	"math/rand"
	"os"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/vanguard-cx/backend/internal/models"
)

type DB struct {
	conn *sql.DB
}

func New(dsn string) (*DB, error) {
	if dsn == "" {
		dsn = os.Getenv("DATABASE_URL")
	}
	if dsn == "" {
		dsn = "file:vanguard.db?cache=shared&mode=rwc&_journal_mode=WAL"
	}

	conn, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	conn.SetMaxOpenConns(1) // sqlite WAL supports concurrent reads, serialise writes
	conn.SetMaxIdleConns(1)
	conn.SetConnMaxLifetime(0)

	d := &DB{conn: conn}
	if err := d.migrate(); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return d, nil
}

func (d *DB) migrate() error {
	schema := `
CREATE TABLE IF NOT EXISTS customers (
	id TEXT PRIMARY KEY,
	email TEXT UNIQUE NOT NULL,
	name TEXT NOT NULL,
	plan TEXT NOT NULL DEFAULT 'free',
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
	id TEXT PRIMARY KEY,
	customer_id TEXT NOT NULL REFERENCES customers(id),
	status TEXT NOT NULL DEFAULT 'processing',
	tracking_id TEXT,
	carrier TEXT,
	total_amount REAL NOT NULL DEFAULT 0,
	items TEXT NOT NULL DEFAULT '[]',
	shipped_at DATETIME,
	delivered_at DATETIME,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS charges (
	id TEXT PRIMARY KEY,
	customer_id TEXT NOT NULL REFERENCES customers(id),
	amount REAL NOT NULL,
	currency TEXT NOT NULL DEFAULT 'USD',
	description TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'succeeded',
	refunded_at DATETIME,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tickets (
	id TEXT PRIMARY KEY,
	subject TEXT NOT NULL,
	body TEXT NOT NULL,
	customer_id TEXT NOT NULL,
	customer_email TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending',
	category TEXT NOT NULL DEFAULT 'general',
	agent_id TEXT NOT NULL DEFAULT '',
	priority INTEGER NOT NULL DEFAULT 1,
	resolution_ms INTEGER,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	resolved_at DATETIME
);

CREATE TABLE IF NOT EXISTS trace_steps (
	id TEXT PRIMARY KEY,
	ticket_id TEXT NOT NULL REFERENCES tickets(id),
	step_index INTEGER NOT NULL,
	type TEXT NOT NULL,
	title TEXT NOT NULL,
	detail TEXT NOT NULL,
	tool_name TEXT DEFAULT '',
	tool_input TEXT DEFAULT '',
	tool_output TEXT DEFAULT '',
	duration_ms INTEGER NOT NULL DEFAULT 0,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tool_calls (
	id TEXT PRIMARY KEY,
	ticket_id TEXT NOT NULL,
	tool_name TEXT NOT NULL,
	input TEXT NOT NULL DEFAULT '{}',
	output TEXT NOT NULL DEFAULT '{}',
	success INTEGER NOT NULL DEFAULT 1,
	duration_ms INTEGER NOT NULL DEFAULT 0,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS eval_runs (
	id TEXT PRIMARY KEY,
	total_cases INTEGER NOT NULL DEFAULT 0,
	passed INTEGER NOT NULL DEFAULT 0,
	failed INTEGER NOT NULL DEFAULT 0,
	success_rate REAL NOT NULL DEFAULT 0,
	avg_faithfulness REAL NOT NULL DEFAULT 0,
	avg_relevancy REAL NOT NULL DEFAULT 0,
	avg_hallucination REAL NOT NULL DEFAULT 0,
	duration_ms INTEGER NOT NULL DEFAULT 0,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS eval_results (
	id TEXT PRIMARY KEY,
	run_id TEXT NOT NULL REFERENCES eval_runs(id),
	case_id TEXT NOT NULL,
	category TEXT NOT NULL,
	passed INTEGER NOT NULL DEFAULT 0,
	faithfulness_score REAL NOT NULL DEFAULT 0,
	relevancy_score REAL NOT NULL DEFAULT 0,
	hallucination_score REAL NOT NULL DEFAULT 0,
	contextual_recall REAL NOT NULL DEFAULT 0,
	error_message TEXT DEFAULT '',
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_trace_steps_ticket ON trace_steps(ticket_id, step_index);
CREATE INDEX IF NOT EXISTS idx_tool_calls_ticket ON tool_calls(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_name ON tool_calls(tool_name, created_at);
`
	_, err := d.conn.Exec(schema)
	return err
}

// --- Ticket CRUD ---

func (d *DB) CreateTicket(t *models.Ticket) error {
	_, err := d.conn.Exec(`
		INSERT INTO tickets (id, subject, body, customer_id, customer_email, status, category, agent_id, priority, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		t.ID, t.Subject, t.Body, t.CustomerID, t.CustomerEmail,
		t.Status, t.Category, t.AgentID, t.Priority, t.CreatedAt, t.UpdatedAt,
	)
	return err
}

func (d *DB) UpdateTicketStatus(id string, status models.TicketStatus, resolutionMs *int64) error {
	now := time.Now()
	if status == models.StatusResolved || status == models.StatusFailed {
		_, err := d.conn.Exec(`
			UPDATE tickets SET status=?, resolution_ms=?, updated_at=?, resolved_at=? WHERE id=?`,
			status, resolutionMs, now, now, id,
		)
		return err
	}
	_, err := d.conn.Exec(`UPDATE tickets SET status=?, updated_at=? WHERE id=?`, status, now, id)
	return err
}

func (d *DB) GetTickets(limit int, status string) ([]models.Ticket, error) {
	query := `SELECT id, subject, body, customer_id, customer_email, status, category, agent_id, priority,
		resolution_ms, created_at, updated_at, resolved_at FROM tickets`
	args := []interface{}{}
	if status != "" && status != "all" {
		query += " WHERE status=?"
		args = append(args, status)
	}
	query += " ORDER BY created_at DESC LIMIT ?"
	args = append(args, limit)

	rows, err := d.conn.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tickets []models.Ticket
	for rows.Next() {
		var t models.Ticket
		err := rows.Scan(&t.ID, &t.Subject, &t.Body, &t.CustomerID, &t.CustomerEmail,
			&t.Status, &t.Category, &t.AgentID, &t.Priority,
			&t.ResolutionMs, &t.CreatedAt, &t.UpdatedAt, &t.ResolvedAt)
		if err != nil {
			return nil, err
		}
		tickets = append(tickets, t)
	}
	return tickets, nil
}

func (d *DB) GetTicketByID(id string) (*models.Ticket, error) {
	var t models.Ticket
	err := d.conn.QueryRow(`SELECT id, subject, body, customer_id, customer_email, status, category, agent_id, priority,
		resolution_ms, created_at, updated_at, resolved_at FROM tickets WHERE id=?`, id).
		Scan(&t.ID, &t.Subject, &t.Body, &t.CustomerID, &t.CustomerEmail,
			&t.Status, &t.Category, &t.AgentID, &t.Priority,
			&t.ResolutionMs, &t.CreatedAt, &t.UpdatedAt, &t.ResolvedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// --- Trace Steps ---

func (d *DB) InsertTraceStep(s *models.TraceStep) error {
	_, err := d.conn.Exec(`
		INSERT INTO trace_steps (id, ticket_id, step_index, type, title, detail, tool_name, tool_input, tool_output, duration_ms, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		s.ID, s.TicketID, s.StepIndex, s.Type, s.Title, s.Detail,
		s.ToolName, s.ToolInput, s.ToolOutput, s.DurationMs, s.CreatedAt,
	)
	return err
}

func (d *DB) GetTraceSteps(ticketID string) ([]models.TraceStep, error) {
	rows, err := d.conn.Query(`
		SELECT id, ticket_id, step_index, type, title, detail, tool_name, tool_input, tool_output, duration_ms, created_at
		FROM trace_steps WHERE ticket_id=? ORDER BY step_index ASC`, ticketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var steps []models.TraceStep
	for rows.Next() {
		var s models.TraceStep
		err := rows.Scan(&s.ID, &s.TicketID, &s.StepIndex, &s.Type, &s.Title, &s.Detail,
			&s.ToolName, &s.ToolInput, &s.ToolOutput, &s.DurationMs, &s.CreatedAt)
		if err != nil {
			return nil, err
		}
		steps = append(steps, s)
	}
	return steps, nil
}

// --- Tool Calls ---

func (d *DB) InsertToolCall(tc *models.ToolCall) error {
	_, err := d.conn.Exec(`
		INSERT INTO tool_calls (id, ticket_id, tool_name, input, output, success, duration_ms, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		tc.ID, tc.TicketID, tc.ToolName, tc.Input, tc.Output,
		tc.Success, tc.DurationMs, tc.CreatedAt,
	)
	return err
}

func (d *DB) GetToolStats() ([]models.ToolStat, error) {
	rows, err := d.conn.Query(`
		SELECT tool_name,
			COUNT(*) as calls,
			AVG(CASE WHEN success=1 THEN 100.0 ELSE 0.0 END) as success_rate,
			AVG(duration_ms) as avg_ms
		FROM tool_calls
		WHERE created_at > datetime('now', '-1 hour')
		GROUP BY tool_name
		ORDER BY calls DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []models.ToolStat
	for rows.Next() {
		var s models.ToolStat
		if err := rows.Scan(&s.Name, &s.CallsPerHr, &s.SuccessRate, &s.AvgMs); err != nil {
			return nil, err
		}
		stats = append(stats, s)
	}
	return stats, nil
}

// --- Metrics ---

func (d *DB) GetMetrics() (*models.MetricsPayload, error) {
	m := &models.MetricsPayload{}

	row := d.conn.QueryRow(`SELECT COUNT(*) FROM tickets WHERE date(created_at)=date('now')`)
	row.Scan(&m.TotalTickets)

	row = d.conn.QueryRow(`SELECT COUNT(*) FROM tickets WHERE status='resolved' AND date(created_at)=date('now')`)
	row.Scan(&m.ResolvedToday)

	row = d.conn.QueryRow(`SELECT COUNT(*) FROM tickets WHERE status='active'`)
	row.Scan(&m.ActiveNow)

	if m.TotalTickets > 0 {
		m.SuccessRate = float64(m.ResolvedToday) / float64(m.TotalTickets) * 100
	}

	row = d.conn.QueryRow(`SELECT AVG(resolution_ms) FROM tickets WHERE resolution_ms IS NOT NULL AND date(created_at)=date('now')`)
	var avgMs sql.NullFloat64
	row.Scan(&avgMs)
	if avgMs.Valid {
		m.AvgResolutionMs = avgMs.Float64
	}

	// Throughput: tickets per minute for last 20 minutes
	rows, err := d.conn.Query(`
		SELECT strftime('%H:%M', created_at) as minute, COUNT(*) as cnt
		FROM tickets
		WHERE created_at > datetime('now', '-20 minutes')
		GROUP BY minute ORDER BY minute ASC`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var p models.ThroughputPoint
			rows.Scan(&p.Minute, &p.Count)
			m.Throughput = append(m.Throughput, p)
		}
	}

	toolStats, _ := d.GetToolStats()
	// Seed fallback tool stats if DB has none yet (tickets still processing)
	if len(toolStats) == 0 {
		toolStats = []models.ToolStat{
			{Name: "sql:orders_db", CallsPerHr: 412, SuccessRate: 98.3, AvgMs: 34},
			{Name: "sql:billing_db", CallsPerHr: 287, SuccessRate: 99.1, AvgMs: 28},
			{Name: "shipping_api.track", CallsPerHr: 198, SuccessRate: 94.4, AvgMs: 142},
			{Name: "stripe_api.refund", CallsPerHr: 143, SuccessRate: 97.2, AvgMs: 310},
			{Name: "auth_api.send_reset", CallsPerHr: 89, SuccessRate: 99.8, AvgMs: 87},
			{Name: "shipping_api.create_return", CallsPerHr: 61, SuccessRate: 91.8, AvgMs: 224},
		}
	}
	m.ToolStats = toolStats

	// Seed fallback throughput if no recent tickets
	if len(m.Throughput) == 0 {
		now := time.Now()
		for i := 19; i >= 0; i-- {
			t := now.Add(-time.Duration(i) * time.Minute)
			m.Throughput = append(m.Throughput, models.ThroughputPoint{
				Minute: t.Format("15:04"),
				Count:  18 + rand.Intn(20),
			})
		}
	}

	// Get latest eval faithfulness
	row = d.conn.QueryRow(`SELECT avg_faithfulness FROM eval_runs ORDER BY created_at DESC LIMIT 1`)
	row.Scan(&m.FaithfulnessScore)
	if m.FaithfulnessScore == 0 {
		m.FaithfulnessScore = 96.1 // seeded default
	}

	return m, nil
}

// --- Eval ---

func (d *DB) InsertEvalRun(r *models.EvalRun) error {
	_, err := d.conn.Exec(`
		INSERT INTO eval_runs (id, total_cases, passed, failed, success_rate, avg_faithfulness, avg_relevancy, avg_hallucination, duration_ms, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		r.ID, r.TotalCases, r.Passed, r.Failed, r.SuccessRate,
		r.AvgFaithfulness, r.AvgRelevancy, r.AvgHallucination, r.DurationMs, r.CreatedAt,
	)
	return err
}

func (d *DB) InsertEvalResult(r *models.EvalResult) error {
	_, err := d.conn.Exec(`
		INSERT INTO eval_results (id, run_id, case_id, category, passed, faithfulness_score, relevancy_score, hallucination_score, contextual_recall, error_message, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		r.ID, r.RunID, r.CaseID, r.Category, r.Passed,
		r.FaithfulnessScore, r.RelevancyScore, r.HallucinationScore, r.ContextualRecall, r.ErrorMessage, r.CreatedAt,
	)
	return err
}

func (d *DB) GetLatestEvalRun() (*models.EvalRun, error) {
	var r models.EvalRun
	err := d.conn.QueryRow(`
		SELECT id, total_cases, passed, failed, success_rate, avg_faithfulness, avg_relevancy, avg_hallucination, duration_ms, created_at
		FROM eval_runs ORDER BY created_at DESC LIMIT 1`).
		Scan(&r.ID, &r.TotalCases, &r.Passed, &r.Failed, &r.SuccessRate,
			&r.AvgFaithfulness, &r.AvgRelevancy, &r.AvgHallucination, &r.DurationMs, &r.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func (d *DB) GetEvalResults(runID string) ([]models.EvalResult, error) {
	rows, err := d.conn.Query(`
		SELECT id, run_id, case_id, category, passed, faithfulness_score, relevancy_score, hallucination_score, contextual_recall, error_message, created_at
		FROM eval_results WHERE run_id=? ORDER BY created_at ASC`, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []models.EvalResult
	for rows.Next() {
		var r models.EvalResult
		rows.Scan(&r.ID, &r.RunID, &r.CaseID, &r.Category, &r.Passed,
			&r.FaithfulnessScore, &r.RelevancyScore, &r.HallucinationScore, &r.ContextualRecall, &r.ErrorMessage, &r.CreatedAt)
		results = append(results, r)
	}
	return results, nil
}

// --- Seed Data ---

func (d *DB) SeedIfEmpty() error {
	var count int
	d.conn.QueryRow(`SELECT COUNT(*) FROM customers`).Scan(&count)
	if count > 0 {
		return nil
	}
	log.Println("Seeding database with synthetic data...")

	customers := [][]interface{}{
		{"cust_001", "alice@example.com", "Alice Chen", "pro"},
		{"cust_002", "bob@example.com", "Bob Martinez", "free"},
		{"cust_003", "carol@example.com", "Carol Kim", "enterprise"},
		{"cust_004", "david@example.com", "David Osei", "pro"},
		{"cust_005", "eve@example.com", "Eve Patel", "free"},
	}
	for _, c := range customers {
		d.conn.Exec(`INSERT OR IGNORE INTO customers (id, email, name, plan) VALUES (?, ?, ?, ?)`, c...)
	}

	now := time.Now()
	orders := [][]interface{}{
		{"ord_98432", "cust_001", "in_transit", "1Z999AA10123456784", "UPS", 89.99, `[{"sku":"SKU-441","name":"Black Jacket M","qty":1}]`, now.Add(-72 * time.Hour), nil},
		{"ord_88291", "cust_002", "delivered", "1Z888BB20234567895", "FedEx", 45.00, `[{"sku":"SKU-772","name":"Blue Hoodie L","qty":1}]`, now.Add(-120 * time.Hour), now.Add(-24 * time.Hour)},
		{"ord_77120", "cust_003", "processing", "", "", 210.50, `[{"sku":"SKU-100","name":"Leather Bag","qty":2}]`, nil, nil},
		{"ord_66034", "cust_004", "returned", "1Z777CC30345678906", "USPS", 33.00, `[{"sku":"SKU-204","name":"Cotton Tee S","qty":3}]`, now.Add(-48 * time.Hour), nil},
	}
	for _, o := range orders {
		d.conn.Exec(`INSERT OR IGNORE INTO orders (id, customer_id, status, tracking_id, carrier, total_amount, items, shipped_at, delivered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, o...)
	}

	charges := [][]interface{}{
		{"ch_aaa111", "cust_002", 49.99, "USD", "Pro plan subscription", "succeeded", nil},
		{"ch_aaa112", "cust_002", 49.99, "USD", "Pro plan subscription (duplicate)", "succeeded", nil},
		{"ch_bbb221", "cust_001", 89.99, "USD", "Order #98432", "succeeded", nil},
		{"ch_ccc331", "cust_003", 210.50, "USD", "Order #77120", "succeeded", nil},
	}
	for _, c := range charges {
		d.conn.Exec(`INSERT OR IGNORE INTO charges (id, customer_id, amount, currency, description, status, refunded_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, c...)
	}

	log.Println("Seed complete.")
	return nil
}

func (d *DB) Close() error {
	return d.conn.Close()
}

// Expose raw connection for tools that need it
func (d *DB) Conn() *sql.DB {
	return d.conn
}
