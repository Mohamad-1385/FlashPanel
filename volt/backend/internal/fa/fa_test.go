// Package fa tests — Persian digits + bytes.
package fa

import "testing"

func TestDigits(t *testing.T) {
	if Digits("123GB / 456") != "۱۲۳GB / ۴۵۶" {
		t.Fatal("Digits wrong")
	}
}

func TestBytes(t *testing.T) {
	if Bytes(5<<20) != "۵٫۰ مگابایت" {
		t.Fatalf("Bytes(5MB) = %s", Bytes(5<<20))
	}
	if Bytes(512) != "۵۱۲ بایت" {
		t.Fatalf("Bytes(512) = %s", Bytes(512))
	}
}
