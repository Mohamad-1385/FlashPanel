// Package store tests — persistence + admin claim.
package store

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAdminClaim(t *testing.T) {
	s := Open(filepath.Join(t.TempDir(), "st.json"))
	if s.IsAdmin(7) {
		t.Fatal("7 must not be admin yet")
	}
	if !s.AddAdmin(7) {
		t.Fatal("first claim must succeed")
	}
	if s.AddAdmin(7) {
		t.Fatal("double claim must be rejected")
	}
	if !s.IsAdmin(7) {
		t.Fatal("7 must be admin now")
	}
}

func TestPersistAcrossOpen(t *testing.T) {
	p := filepath.Join(t.TempDir(), "st.json")
	s := Open(p)
	s.AddAdmin(11)
	s.Update(func(x *State) { x.CmdCount = 42; x.KeysCreated = 3 })
	s2 := Open(p)
	g := s2.Get()
	if !s2.IsAdmin(11) || g.CmdCount != 42 || g.KeysCreated != 3 {
		t.Fatalf("state lost: %+v admin=%v", g, s2.IsAdmin(11))
	}
}

func TestTmpMirrorWritten(t *testing.T) {
	_ = os.Remove(tmpMirror)
	s := Open(filepath.Join(t.TempDir(), "st.json"))
	s.AddAdmin(13)
	if _, err := os.Stat(tmpMirror); err != nil {
		t.Fatalf("/tmp mirror missing: %v", err)
	}
}
