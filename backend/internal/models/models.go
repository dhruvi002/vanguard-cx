package models

import "time"

type TicketStatus string
type TicketCategory string
type StepType string

const (
	StatusPending  TicketStatus = "pending"
	StatusActive   TicketStatus = "active"
	StatusResolved TicketStatus = "resolved"
	StatusFailed   TicketStatus = "failed"
	StatusEscalated TicketStatus = "escalated"

	CategoryShipping TicketCategory = "shipping"
	CategoryBilling  TicketCategory = "billing"
	CategoryAuth     TicketCategory = "auth"
	CategoryAPI      TicketCategory = "api"
	CategoryReturns  TicketCategory = "returns"
	CategoryGeneral  TicketCategory = "general"

	StepThink  StepType = "think"
	StepTool   StepType = "tool"
	StepDB     StepType = "db"
	StepAPI    StepType = "api"
	StepOutput StepType = "output"
	StepError  StepType = "error"
)

type Ticket struct {
	ID           string         `json:"id" db:"id"`
	Subject      string         `json:"subject" db:"subject"`
	Body         string         `json:"body" db:"body"`
	CustomerID   string         `json:"customer_id" db:"customer_id"`
	CustomerEmail string        `json:"customer_email" db:"customer_email"`
	Status       TicketStatus   `json:"status" db:"status"`
	Category     TicketCategory `json:"category" db:"category"`
	AgentID      string         `json:"agent_id" db:"agent_id"`
	Priority     int            `json:"priority" db:"priority"`
	ResolutionMs *int64         `json:"resolution_ms,omitempty" db:"resolution_ms"`
	CreatedAt    time.Time      `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at" db:"updated_at"`
	ResolvedAt   *time.Time     `json:"resolved_at,omitempty" db:"resolved_at"`
}

type TraceStep struct {
	ID        string    `json:"id" db:"id"`
	TicketID  string    `json:"ticket_id" db:"ticket_id"`
	StepIndex int       `json:"step_index" db:"step_index"`
	Type      StepType  `json:"type" db:"type"`
	Title     string    `json:"title" db:"title"`
	Detail    string    `json:"detail" db:"detail"`
	ToolName  string    `json:"tool_name,omitempty" db:"tool_name"`
	ToolInput string    `json:"tool_input,omitempty" db:"tool_input"`
	ToolOutput string   `json:"tool_output,omitempty" db:"tool_output"`
	DurationMs int64    `json:"duration_ms" db:"duration_ms"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

type ToolCall struct {
	ID         string    `json:"id" db:"id"`
	TicketID   string    `json:"ticket_id" db:"ticket_id"`
	ToolName   string    `json:"tool_name" db:"tool_name"`
	Input      string    `json:"input" db:"input"`
	Output     string    `json:"output" db:"output"`
	Success    bool      `json:"success" db:"success"`
	DurationMs int64     `json:"duration_ms" db:"duration_ms"`
	CreatedAt  time.Time `json:"created_at" db:"created_at"`
}

type EvalResult struct {
	ID               string    `json:"id" db:"id"`
	RunID            string    `json:"run_id" db:"run_id"`
	CaseID           string    `json:"case_id" db:"case_id"`
	Category         string    `json:"category" db:"category"`
	Passed           bool      `json:"passed" db:"passed"`
	FaithfulnessScore float64  `json:"faithfulness_score" db:"faithfulness_score"`
	RelevancyScore   float64   `json:"relevancy_score" db:"relevancy_score"`
	HallucinationScore float64 `json:"hallucination_score" db:"hallucination_score"`
	ContextualRecall float64   `json:"contextual_recall" db:"contextual_recall"`
	ErrorMessage     string    `json:"error_message,omitempty" db:"error_message"`
	CreatedAt        time.Time `json:"created_at" db:"created_at"`
}

type EvalRun struct {
	ID          string    `json:"id" db:"id"`
	TotalCases  int       `json:"total_cases" db:"total_cases"`
	Passed      int       `json:"passed" db:"passed"`
	Failed      int       `json:"failed" db:"failed"`
	SuccessRate float64   `json:"success_rate" db:"success_rate"`
	AvgFaithfulness float64 `json:"avg_faithfulness" db:"avg_faithfulness"`
	AvgRelevancy   float64 `json:"avg_relevancy" db:"avg_relevancy"`
	AvgHallucination float64 `json:"avg_hallucination" db:"avg_hallucination"`
	DurationMs  int64     `json:"duration_ms" db:"duration_ms"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}

type Order struct {
	ID           string    `json:"id" db:"id"`
	CustomerID   string    `json:"customer_id" db:"customer_id"`
	Status       string    `json:"status" db:"status"`
	TrackingID   string    `json:"tracking_id" db:"tracking_id"`
	Carrier      string    `json:"carrier" db:"carrier"`
	TotalAmount  float64   `json:"total_amount" db:"total_amount"`
	Items        string    `json:"items" db:"items"`
	ShippedAt    *time.Time `json:"shipped_at,omitempty" db:"shipped_at"`
	DeliveredAt  *time.Time `json:"delivered_at,omitempty" db:"delivered_at"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
}

type Customer struct {
	ID        string    `json:"id" db:"id"`
	Email     string    `json:"email" db:"email"`
	Name      string    `json:"name" db:"name"`
	Plan      string    `json:"plan" db:"plan"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

type Charge struct {
	ID           string    `json:"id" db:"id"`
	CustomerID   string    `json:"customer_id" db:"customer_id"`
	Amount       float64   `json:"amount" db:"amount"`
	Currency     string    `json:"currency" db:"currency"`
	Description  string    `json:"description" db:"description"`
	Status       string    `json:"status" db:"status"`
	RefundedAt   *time.Time `json:"refunded_at,omitempty" db:"refunded_at"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
}

// WebSocket message types
type WSMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

type MetricsPayload struct {
	TotalTickets    int     `json:"total_tickets"`
	ResolvedToday   int     `json:"resolved_today"`
	ActiveNow       int     `json:"active_now"`
	SuccessRate     float64 `json:"success_rate"`
	AvgResolutionMs float64 `json:"avg_resolution_ms"`
	FaithfulnessScore float64 `json:"faithfulness_score"`
	Throughput      []ThroughputPoint `json:"throughput"`
	ToolStats       []ToolStat `json:"tool_stats"`
}

type ThroughputPoint struct {
	Minute    string `json:"minute"`
	Count     int    `json:"count"`
}

type ToolStat struct {
	Name       string  `json:"name"`
	CallsPerHr int     `json:"calls_per_hr"`
	SuccessRate float64 `json:"success_rate"`
	AvgMs      float64 `json:"avg_ms"`
}
