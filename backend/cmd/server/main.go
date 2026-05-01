package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/rs/cors"
	"github.com/vanguard-cx/backend/internal/agent"
	"github.com/vanguard-cx/backend/internal/db"
	"github.com/vanguard-cx/backend/internal/models"
	"github.com/vanguard-cx/backend/internal/tools"
	"github.com/vanguard-cx/backend/internal/ws"
)

type Server struct {
	db           *db.DB
	hub          *ws.Hub
	orchestrator *agent.Orchestrator
}

func main() {
	log.SetFlags(log.Ltime | log.Lshortfile)
	log.Println("Starting Vanguard-CX backend...")

	database, err := db.New("")
	if err != nil {
		log.Fatalf("db init: %v", err)
	}
	defer database.Close()

	if err := database.SeedIfEmpty(); err != nil {
		log.Printf("seed warning: %v", err)
	}

	hub := ws.NewHub()
	go hub.Run()

	executor := tools.NewExecutor(database.Conn())
	orch := agent.NewOrchestrator(database, executor, hub)

	srv := &Server{db: database, hub: hub, orchestrator: orch}

	// Start synthetic ticket generator for live demo
	go srv.ticketGenerator()

	// Routes
	mux := http.NewServeMux()

	// REST API
	mux.HandleFunc("GET /api/tickets", srv.handleGetTickets)
	mux.HandleFunc("POST /api/tickets", srv.handleCreateTicket)
	mux.HandleFunc("GET /api/tickets/{id}", srv.handleGetTicket)
	mux.HandleFunc("GET /api/tickets/{id}/trace", srv.handleGetTrace)
	mux.HandleFunc("GET /api/metrics", srv.handleGetMetrics)
	mux.HandleFunc("GET /api/tools/stats", srv.handleGetToolStats)
	mux.HandleFunc("GET /api/eval/latest", srv.handleGetLatestEval)
	mux.HandleFunc("GET /api/eval/{runID}/results", srv.handleGetEvalResults)
	mux.HandleFunc("POST /api/eval/run", srv.handleTriggerEval)
	mux.HandleFunc("GET /health", srv.handleHealth)

	// WebSocket
	mux.HandleFunc("GET /ws", hub.ServeWS)

	// CORS — allow Vercel frontend and local dev
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: false,
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Listening on :%s", port)
	if err := http.ListenAndServe(":"+port, c.Handler(mux)); err != nil {
		log.Fatalf("server: %v", err)
	}
}

// --- Handlers ---

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]string{"status": "ok", "service": "vanguard-cx-backend"})
}

func (s *Server) handleGetTickets(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}
	tickets, err := s.db.GetTickets(limit, status)
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 200, tickets)
}

func (s *Server) handleCreateTicket(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Subject       string `json:"subject"`
		Body          string `json:"body"`
		CustomerEmail string `json:"customer_email"`
		Priority      int    `json:"priority"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, 400, err)
		return
	}
	if body.Subject == "" || body.CustomerEmail == "" {
		writeJSON(w, 400, map[string]string{"error": "subject and customer_email required"})
		return
	}
	if body.Priority == 0 {
		body.Priority = 1
	}

	ticket := &models.Ticket{
		ID:            fmt.Sprintf("TKT-%d", rand.Intn(90000)+10000),
		Subject:       body.Subject,
		Body:          body.Body,
		CustomerID:    "cust_" + randomStr(6),
		CustomerEmail: body.CustomerEmail,
		Status:        models.StatusPending,
		Category:      models.CategoryGeneral,
		AgentID:       "",
		Priority:      body.Priority,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	if err := s.db.CreateTicket(ticket); err != nil {
		writeErr(w, 500, err)
		return
	}

	// Process asynchronously
	go s.orchestrator.ProcessTicket(ticket)

	writeJSON(w, 201, ticket)
}

func (s *Server) handleGetTicket(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ticket, err := s.db.GetTicketByID(id)
	if err != nil {
		writeErr(w, 404, fmt.Errorf("ticket not found"))
		return
	}
	writeJSON(w, 200, ticket)
}

func (s *Server) handleGetTrace(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	steps, err := s.db.GetTraceSteps(id)
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	if steps == nil {
		steps = []models.TraceStep{}
	}
	writeJSON(w, 200, steps)
}

func (s *Server) handleGetMetrics(w http.ResponseWriter, r *http.Request) {
	m, err := s.db.GetMetrics()
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 200, m)
}

func (s *Server) handleGetToolStats(w http.ResponseWriter, r *http.Request) {
	stats, err := s.db.GetToolStats()
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 200, stats)
}

func (s *Server) handleGetLatestEval(w http.ResponseWriter, r *http.Request) {
	run, err := s.db.GetLatestEvalRun()
	if err != nil {
		// Return seeded defaults if no eval has run
		writeJSON(w, 200, &models.EvalRun{
			ID:              "eval_default",
			TotalCases:      500,
			Passed:          460,
			Failed:          40,
			SuccessRate:     92.0,
			AvgFaithfulness: 96.1,
			AvgRelevancy:    94.3,
			AvgHallucination: 3.9,
			DurationMs:      183000,
			CreatedAt:       time.Now().Add(-2 * time.Hour),
		})
		return
	}
	writeJSON(w, 200, run)
}

func (s *Server) handleGetEvalResults(w http.ResponseWriter, r *http.Request) {
	runID := r.PathValue("runID")
	results, err := s.db.GetEvalResults(runID)
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, 200, results)
}

func (s *Server) handleTriggerEval(w http.ResponseWriter, r *http.Request) {
	runID := uuid.New().String()
	go s.runSyntheticEval(runID)
	writeJSON(w, 202, map[string]string{"run_id": runID, "status": "started"})
}

// --- Synthetic Eval Runner (simulates DeepEval scores) ---

func (s *Server) runSyntheticEval(runID string) {
	log.Printf("[eval] starting eval run %s", runID)
	start := time.Now()

	categories := []string{"shipping", "billing", "auth", "returns", "api", "adversarial", "edge_case"}
	total := 500
	passed := 0

	categoryScores := map[string][]float64{}

	for i := 0; i < total; i++ {
		cat := categories[rand.Intn(len(categories))]

		// Adversarial cases are harder
		basePass := 0.94
		if cat == "adversarial" {
			basePass = 0.87
		} else if cat == "edge_case" {
			basePass = 0.91
		}

		isPass := rand.Float64() < basePass
		if isPass {
			passed++
		}

		faithfulness := 0.88 + rand.Float64()*0.12
		relevancy := 0.86 + rand.Float64()*0.14
		hallucination := rand.Float64() * 0.08
		recall := 0.85 + rand.Float64()*0.15

		if !isPass {
			faithfulness *= 0.7
			relevancy *= 0.75
			hallucination = 0.1 + rand.Float64()*0.2
		}

		categoryScores[cat] = append(categoryScores[cat], faithfulness)

		result := &models.EvalResult{
			ID:                 uuid.New().String(),
			RunID:              runID,
			CaseID:             fmt.Sprintf("case_%04d", i+1),
			Category:           cat,
			Passed:             isPass,
			FaithfulnessScore:  faithfulness,
			RelevancyScore:     relevancy,
			HallucinationScore: hallucination,
			ContextualRecall:   recall,
			CreatedAt:          time.Now(),
		}
		if !isPass {
			result.ErrorMessage = "Response deviated from grounded context"
		}

		s.db.InsertEvalResult(result)

		// Throttle to not hammer SQLite
		if i%50 == 0 {
			time.Sleep(10 * time.Millisecond)
			progress := float64(i) / float64(total) * 100
			s.hub.Broadcast(models.WSMessage{
				Type: "eval_progress",
				Payload: map[string]interface{}{
					"run_id": runID, "progress": progress,
					"passed": passed, "total": i + 1,
				},
			})
		}
	}

	failed := total - passed
	successRate := float64(passed) / float64(total) * 100

	run := &models.EvalRun{
		ID:               runID,
		TotalCases:       total,
		Passed:           passed,
		Failed:           failed,
		SuccessRate:      successRate,
		AvgFaithfulness:  0.88 + rand.Float64()*0.10,
		AvgRelevancy:     0.86 + rand.Float64()*0.10,
		AvgHallucination: rand.Float64() * 0.06,
		DurationMs:       time.Since(start).Milliseconds(),
		CreatedAt:        time.Now(),
	}
	s.db.InsertEvalRun(run)

	s.hub.Broadcast(models.WSMessage{
		Type:    "eval_complete",
		Payload: run,
	})
	log.Printf("[eval] run %s complete: %d/%d passed (%.1f%%)", runID, passed, total, successRate)
}

// --- Synthetic ticket generator for live demo ---

var syntheticTickets = []struct {
	Subject  string
	Body     string
	Email    string
	Category models.TicketCategory
}{
	{"Order #98432 not delivered after 3 weeks", "I ordered on Jan 1st and it still hasn't arrived. Tracking shows 'in transit' for 10 days.", "alice@example.com", models.CategoryShipping},
	{"Charged twice for my subscription", "I see two charges of $49.99 on Jan 14. Please refund the duplicate.", "bob@example.com", models.CategoryBilling},
	{"Cannot log in — account locked", "I've been locked out for 2 days. Password reset emails aren't arriving.", "carol@example.com", models.CategoryAuth},
	{"Wrong item shipped in my order", "I ordered a Black Jacket (M) but received a Blue Hoodie (L). Need a return label.", "david@example.com", models.CategoryReturns},
	{"API key stopped working after plan upgrade", "My API key returns 401 after I upgraded to Pro. Integration is broken.", "eve@example.com", models.CategoryAPI},
	{"Where is my refund?", "I returned an item 2 weeks ago but haven't received my refund yet.", "alice@example.com", models.CategoryBilling},
	{"Package shows delivered but not received", "UPS says delivered yesterday but nothing at my door. Neighbors haven't seen it.", "bob@example.com", models.CategoryShipping},
	{"Subscription billed after cancellation", "I cancelled my account 3 days before renewal but was still charged.", "carol@example.com", models.CategoryBilling},
}

func (s *Server) ticketGenerator() {
	// Wait for initial seed
	time.Sleep(5 * time.Second)

	// Generate initial batch for demo
	for i := 0; i < 8; i++ {
		t := syntheticTickets[i%len(syntheticTickets)]
		ticket := &models.Ticket{
			ID:            fmt.Sprintf("TKT-%d", rand.Intn(90000)+10000),
			Subject:       t.Subject,
			Body:          t.Body,
			CustomerID:    "cust_00" + strconv.Itoa(rand.Intn(5)+1),
			CustomerEmail: t.Email,
			Status:        models.StatusPending,
			Category:      t.Category,
			AgentID:       "",
			Priority:      rand.Intn(3) + 1,
			CreatedAt:     time.Now().Add(-time.Duration(i*3) * time.Minute),
			UpdatedAt:     time.Now(),
		}
		s.db.CreateTicket(ticket)
		go s.orchestrator.ProcessTicket(ticket)
		time.Sleep(800 * time.Millisecond)
	}

	// Continuous generation every 20-45s for live demo
	for {
		sleep := time.Duration(20+rand.Intn(25)) * time.Second
		time.Sleep(sleep)

		t := syntheticTickets[rand.Intn(len(syntheticTickets))]
		ticket := &models.Ticket{
			ID:            fmt.Sprintf("TKT-%d", rand.Intn(90000)+10000),
			Subject:       t.Subject,
			Body:          t.Body,
			CustomerID:    "cust_00" + strconv.Itoa(rand.Intn(5)+1),
			CustomerEmail: t.Email,
			Status:        models.StatusPending,
			Category:      t.Category,
			AgentID:       "",
			Priority:      rand.Intn(3) + 1,
			CreatedAt:     time.Now(),
			UpdatedAt:     time.Now(),
		}
		if err := s.db.CreateTicket(ticket); err != nil {
			continue
		}
		go s.orchestrator.ProcessTicket(ticket)
	}
}

// --- Helpers ---

func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, err error) {
	writeJSON(w, code, map[string]string{"error": err.Error()})
}

func randomStr(n int) string {
	const chars = "0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}
