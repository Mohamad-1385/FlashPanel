// Package vault tests — AES-256-GCM roundtrip + real vault file format.
package vault

import (
	"os"
	"path/filepath"
	"testing"
)

func TestEncryptDecryptRoundtrip(t *testing.T) {
	// 32-byte key (hex-encoded 64 chars)
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i * 7)
	}
	v, err := Encrypt("7544772205", "SECRET-TOKEN-XYZ", key)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}
	got, err := v.Decrypt("7544772205", key)
	if err != nil {
		t.Fatalf("Decrypt: %v", err)
	}
	if got != "SECRET-TOKEN-XYZ" {
		t.Fatalf("roundtrip mismatch: %q", got)
	}
	// wrong key must fail
	bad := make([]byte, 32)
	if _, err := v.Decrypt("7544772205", bad); err == nil {
		t.Fatal("wrong key must fail")
	}
}

func TestDecryptRealVaultFormat(t *testing.T) {
	dir := t.TempDir()
	// produce a vault file in the exact tokens.json format via Encrypt, then
	// read it back with Load + Decrypt (the production path)
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 1)
	}
	v, _ := Encrypt("owner1", "TOKEN-ABC", key)
	p := filepath.Join(dir, "tokens.json")
	if err := v.Save(p); err != nil {
		t.Fatal(err)
	}
	// key file
	keyHex := make([]byte, 64)
	const hexdigits = "0123456789abcdef"
	for i := 0; i < 32; i++ {
		keyHex[i*2] = hexdigits[key[i]>>4]
		keyHex[i*2+1] = hexdigits[key[i]&15]
	}
	if err := os.WriteFile(filepath.Join(dir, ".vault-key"), keyHex, 0o600); err != nil {
		t.Fatal(err)
	}

	v2, err := Load(p)
	if err != nil {
		t.Fatal(err)
	}
	k2, err := ReadKeyFile(filepath.Join(dir, ".vault-key"))
	if err != nil {
		t.Fatal(err)
	}
	got, err := v2.Decrypt("owner1", k2)
	if err != nil || got != "TOKEN-ABC" {
		t.Fatalf("production path failed: %v %q", err, got)
	}
}
