package httpserver

import (
	"context"
	"net/http"
	"time"

	"github.com/rizrmd/absencam/apps/api/internal/db"
)

type healthResponse struct {
	Status string `json:"status"`
	App    string `json:"app"`
	Env    string `json:"env"`
}

type readyResponse struct {
	Status   string `json:"status"`
	App      string `json:"app"`
	Database string `json:"database"`
	Error    string `json:"error,omitempty"`
}

type infoResponse struct {
	App     string `json:"app"`
	Version string `json:"version"`
	Env     string `json:"env"`
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, healthResponse{
		Status: "ok",
		App:    s.cfg.AppName,
		Env:    s.cfg.Env,
	})
}

func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()

	if err := db.Ping(ctx, s.pool); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, readyResponse{
			Status:   "degraded",
			App:      s.cfg.AppName,
			Database: "down",
			Error:    err.Error(),
		})
		return
	}

	writeJSON(w, http.StatusOK, readyResponse{
		Status:   "ok",
		App:      s.cfg.AppName,
		Database: "up",
	})
}

func (s *Server) handleInfo(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, infoResponse{
		App:     s.cfg.AppName,
		Version: s.cfg.Version,
		Env:     s.cfg.Env,
	})
}
