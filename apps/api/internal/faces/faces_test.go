package faces

import "testing"

func TestValidateEmbedding(t *testing.T) {
	t.Parallel()

	good := make([]float32, DefaultDim)
	good[0] = 1
	if err := ValidateEmbedding(good, DefaultDim); err != nil {
		t.Fatalf("valid embedding rejected: %v", err)
	}

	if err := ValidateEmbedding(good[:8], DefaultDim); err == nil {
		t.Fatal("expected dimension error")
	}

	zero := make([]float32, DefaultDim)
	if err := ValidateEmbedding(zero, DefaultDim); err == nil {
		t.Fatal("expected zero-norm error")
	}
}

func TestFormatVector(t *testing.T) {
	t.Parallel()
	got := FormatVector([]float32{0.5, -1, 0})
	want := "[0.5,-1,0]"
	if got != want {
		t.Fatalf("FormatVector = %q, want %q", got, want)
	}
}

func TestCosine(t *testing.T) {
	t.Parallel()
	a := []float32{1, 0, 0}
	b := []float32{1, 0, 0}
	if v := Cosine(a, b); v < 0.999 {
		t.Fatalf("identical cosine = %v", v)
	}
	c := []float32{0, 1, 0}
	if v := Cosine(a, c); v > 0.001 {
		t.Fatalf("orthogonal cosine = %v", v)
	}
}
