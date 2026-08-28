package httpserver

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/rizrmd/absencam/apps/api/internal/faces"
)

func (s *Server) handleListPeople(w http.ResponseWriter, r *http.Request) {
	if s.faces == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "database unavailable"})
		return
	}
	people, err := s.faces.ListPeople(r.Context())
	if err != nil {
		s.log.Error("list people", "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list people failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"people": people})
}

func (s *Server) handleDeletePerson(w http.ResponseWriter, r *http.Request) {
	if s.faces == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "database unavailable"})
		return
	}

	person, err := s.faces.DeletePerson(r.Context(), r.PathValue("id"))
	if err != nil {
		switch {
		case errors.Is(err, faces.ErrInvalidID):
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		case errors.Is(err, faces.ErrNotFound):
			writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		default:
			s.log.Error("delete person", "err", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete person failed"})
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true, "person": person})
}

func (s *Server) handleEnroll(w http.ResponseWriter, r *http.Request) {
	if s.faces == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "database unavailable"})
		return
	}

	var in faces.EnrollInput
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	out, err := s.faces.Enroll(r.Context(), in)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *Server) handleScan(w http.ResponseWriter, r *http.Request) {
	if s.faces == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "database unavailable"})
		return
	}

	var in faces.ScanInput
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	out, err := s.faces.Scan(r.Context(), in)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, out)
}
