package faces

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	DefaultModelID   = "sface-2021dec"
	DefaultDim       = 128
	DefaultThreshold = 0.40
	DefaultMargin    = 0.04
	maxEmbeddings    = 8
	minNorm          = 0.80
	maxNorm          = 1.20
)

type Person struct {
	ID        string    `json:"id"`
	Code      string    `json:"code"`
	FullName  string    `json:"full_name"`
	CreatedAt time.Time `json:"created_at"`
}

type EnrollInput struct {
	Code       string      `json:"code"`
	FullName   string      `json:"full_name"`
	Embeddings [][]float32 `json:"embeddings"`
	ModelID    string      `json:"model_id"`
	Quality    *float32    `json:"quality,omitempty"`
}

type EnrollResult struct {
	Person    Person `json:"person"`
	Stored    int    `json:"stored"`
	ModelID   string `json:"model_id"`
	Dimension int    `json:"dimension"`
}

type ScanInput struct {
	Embedding []float32 `json:"embedding"`
	ModelID   string    `json:"model_id"`
}

type ScanHit struct {
	PersonID   string  `json:"person_id"`
	Code       string  `json:"code"`
	FullName   string  `json:"full_name"`
	Similarity float64 `json:"similarity"`
}

type ScanResult struct {
	Matched    bool      `json:"matched"`
	Person     *ScanHit  `json:"person,omitempty"`
	Similarity float64   `json:"similarity"`
	Threshold  float64   `json:"threshold"`
	Candidates []ScanHit `json:"candidates"`
	EventID    string    `json:"event_id,omitempty"`
}

type Store struct {
	pool      *pgxpool.Pool
	threshold float64
	margin    float64
}

func NewStore(pool *pgxpool.Pool, threshold float64) *Store {
	if threshold <= 0 {
		threshold = DefaultThreshold
	}
	return &Store{pool: pool, threshold: threshold, margin: DefaultMargin}
}

func (s *Store) ListPeople(ctx context.Context) ([]Person, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id::text, code, full_name, created_at
		FROM people
		ORDER BY created_at DESC
		LIMIT 500
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]Person, 0)
	for rows.Next() {
		var p Person
		if err := rows.Scan(&p.ID, &p.Code, &p.FullName, &p.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) Enroll(ctx context.Context, in EnrollInput) (EnrollResult, error) {
	code := strings.TrimSpace(in.Code)
	name := strings.TrimSpace(in.FullName)
	modelID := strings.TrimSpace(in.ModelID)
	if modelID == "" {
		modelID = DefaultModelID
	}
	if code == "" || name == "" {
		return EnrollResult{}, fmt.Errorf("code and full_name are required")
	}
	if len(in.Embeddings) == 0 {
		return EnrollResult{}, fmt.Errorf("at least one embedding is required")
	}
	if len(in.Embeddings) > maxEmbeddings {
		return EnrollResult{}, fmt.Errorf("at most %d embeddings per enroll", maxEmbeddings)
	}
	for i, emb := range in.Embeddings {
		if err := ValidateEmbedding(emb, DefaultDim); err != nil {
			return EnrollResult{}, fmt.Errorf("embedding %d: %w", i, err)
		}
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return EnrollResult{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var person Person
	err = tx.QueryRow(ctx, `
		INSERT INTO people (code, full_name)
		VALUES ($1, $2)
		ON CONFLICT (code) DO UPDATE SET full_name = EXCLUDED.full_name
		RETURNING id::text, code, full_name, created_at
	`, code, name).Scan(&person.ID, &person.Code, &person.FullName, &person.CreatedAt)
	if err != nil {
		return EnrollResult{}, fmt.Errorf("upsert person: %w", err)
	}

	for _, emb := range in.Embeddings {
		if _, err := tx.Exec(ctx, `
			INSERT INTO face_embeddings (person_id, embedding, model_id, quality)
			VALUES ($1, $2::vector, $3, $4)
		`, person.ID, FormatVector(emb), modelID, in.Quality); err != nil {
			return EnrollResult{}, fmt.Errorf("insert embedding: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return EnrollResult{}, err
	}

	return EnrollResult{
		Person:    person,
		Stored:    len(in.Embeddings),
		ModelID:   modelID,
		Dimension: DefaultDim,
	}, nil
}

func (s *Store) Scan(ctx context.Context, in ScanInput) (ScanResult, error) {
	modelID := strings.TrimSpace(in.ModelID)
	if modelID == "" {
		modelID = DefaultModelID
	}
	if err := ValidateEmbedding(in.Embedding, DefaultDim); err != nil {
		return ScanResult{}, err
	}

	rows, err := s.pool.Query(ctx, `
		SELECT p.id::text, p.code, p.full_name,
		       (1 - (e.embedding <=> $1::vector))::float8 AS similarity
		FROM face_embeddings e
		JOIN people p ON p.id = e.person_id
		WHERE e.model_id = $2
		ORDER BY e.embedding <=> $1::vector
		LIMIT 5
	`, FormatVector(in.Embedding), modelID)
	if err != nil {
		return ScanResult{}, fmt.Errorf("search: %w", err)
	}
	defer rows.Close()

	hits := make([]ScanHit, 0, 5)
	for rows.Next() {
		var h ScanHit
		if err := rows.Scan(&h.PersonID, &h.Code, &h.FullName, &h.Similarity); err != nil {
			return ScanResult{}, err
		}
		hits = append(hits, h)
	}
	if err := rows.Err(); err != nil {
		return ScanResult{}, err
	}

	result := ScanResult{
		Matched:    false,
		Similarity: 0,
		Threshold:  s.threshold,
		Candidates: hits,
	}

	if len(hits) > 0 {
		best := hits[0]
		result.Similarity = best.Similarity
		ok := best.Similarity >= s.threshold
		if ok {
			for _, other := range hits[1:] {
				if other.PersonID == best.PersonID {
					continue
				}
				if best.Similarity-other.Similarity < s.margin {
					ok = false
				}
				break
			}
		}
		if ok {
			result.Matched = true
			p := best
			result.Person = &p
		}
	}

	var eventID string
	var personArg any
	if result.Person != nil {
		personArg = result.Person.PersonID
	}
	if err := s.pool.QueryRow(ctx, `
		INSERT INTO attendance_events (person_id, matched, similarity, model_id)
		VALUES ($1, $2, $3, $4)
		RETURNING id::text
	`, personArg, result.Matched, result.Similarity, modelID).Scan(&eventID); err == nil {
		result.EventID = eventID
	}
	return result, nil
}

func ValidateEmbedding(emb []float32, dim int) error {
	if len(emb) != dim {
		return fmt.Errorf("expected %d-d embedding, got %d", dim, len(emb))
	}
	var sum float64
	for _, v := range emb {
		if math.IsNaN(float64(v)) || math.IsInf(float64(v), 0) {
			return fmt.Errorf("embedding contains non-finite values")
		}
		sum += float64(v) * float64(v)
	}
	norm := math.Sqrt(sum)
	if norm < minNorm || norm > maxNorm {
		return fmt.Errorf("embedding L2 norm %.4f is outside [%.2f, %.2f]; send L2-normalized vectors", norm, minNorm, maxNorm)
	}
	return nil
}

func FormatVector(emb []float32) string {
	var b strings.Builder
	b.Grow(len(emb) * 8)
	b.WriteByte('[')
	for i, v := range emb {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(strconv.FormatFloat(float64(v), 'f', -1, 32))
	}
	b.WriteByte(']')
	return b.String()
}

func Cosine(a, b []float32) float64 {
	if len(a) == 0 || len(a) != len(b) {
		return 0
	}
	var dot, na, nb float64
	for i := range a {
		fa := float64(a[i])
		fb := float64(b[i])
		dot += fa * fb
		na += fa * fa
		nb += fb * fb
	}
	den := math.Sqrt(na) * math.Sqrt(nb)
	if den == 0 {
		return 0
	}
	return dot / den
}
