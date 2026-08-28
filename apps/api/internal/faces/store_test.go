package faces

import (
	"context"
	"math"
	"math/rand"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rizrmd/absencam/apps/api/internal/db"
)

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgres://absencam:absencam@127.0.0.1:5432/absencam?sslmode=disable"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := db.Open(ctx, url)
	if err != nil {
		t.Skipf("postgres unavailable: %v", err)
	}
	t.Cleanup(pool.Close)
	migCtx, migCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer migCancel()
	if err := db.Migrate(migCtx, pool); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return pool
}

func randomUnit(seed int64) []float32 {
	r := rand.New(rand.NewSource(seed))
	v := make([]float32, DefaultDim)
	var sum float64
	for i := range v {
		v[i] = float32(r.NormFloat64())
		sum += float64(v[i]) * float64(v[i])
	}
	n := math.Sqrt(sum)
	for i := range v {
		v[i] = float32(float64(v[i]) / n)
	}
	return v
}

func TestEnrollAndScan(t *testing.T) {
	pool := testPool(t)
	store := NewStore(pool, 0.35)
	ctx := context.Background()

	code := "test-" + time.Now().Format("150405.000000")
	emb := randomUnit(time.Now().UnixNano())
	out, err := store.Enroll(ctx, EnrollInput{
		Code:       code,
		FullName:   "Test Person",
		Embeddings: [][]float32{emb},
		ModelID:    DefaultModelID,
	})
	if err != nil {
		t.Fatalf("enroll: %v", err)
	}
	if out.Stored != 1 {
		t.Fatalf("stored = %d", out.Stored)
	}

	scan, err := store.Scan(ctx, ScanInput{Embedding: emb, ModelID: DefaultModelID})
	if err != nil {
		t.Fatalf("scan: %v", err)
	}
	if !scan.Matched || scan.Person == nil || scan.Person.Code != code {
		t.Fatalf("expected match for same embedding, got %+v", scan)
	}

	other := randomUnit(time.Now().UnixNano() + 99)
	miss, err := store.Scan(ctx, ScanInput{Embedding: other, ModelID: DefaultModelID})
	if err != nil {
		t.Fatalf("scan other: %v", err)
	}
	if miss.Matched {
		t.Fatalf("random vector should not match, got %+v", miss)
	}
}
