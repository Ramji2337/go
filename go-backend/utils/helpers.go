package utils

import (
"crypto/rand"
"fmt"
"log"
"math/big"
"strings"
"time"
)

func GenerateSubmissionId(category string) string {
now := time.Now()
year := now.Year()
month := int(now.Month())

n, err := rand.Int(rand.Reader, big.NewInt(9000))
if err != nil {
log.Printf("⚠️  rand.Int failed in GenerateSubmissionId: %v", err)
n = big.NewInt(0)
}
num := n.Int64() + 1000

prefix := "ICMBNT"
if category != "" {
words := strings.Fields(category)
if len(words) > 0 {
abbr := ""
for _, w := range words {
if len(w) > 0 {
abbr += strings.ToUpper(string(w[0]))
}
}
if len(abbr) > 0 {
prefix = abbr
}
}
}

return fmt.Sprintf("%s-%d%02d-%d", prefix, year, month, num)
}

func GenerateBookingId() string {
n, err := rand.Int(rand.Reader, big.NewInt(900000))
if err != nil {
log.Printf("⚠️  rand.Int failed in GenerateBookingId: %v", err)
n = big.NewInt(0)
}
num := n.Int64() + 100000
return fmt.Sprintf("BK%d", num)
}

func GenerateRandomPassword() string {
const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%"
var sb strings.Builder
for i := 0; i < 12; i++ {
n, err := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
if err != nil {
log.Printf("⚠️  rand.Int failed in GenerateRandomPassword: %v", err)
sb.WriteByte(chars[0])
continue
}
sb.WriteByte(chars[n.Int64()])
}
return sb.String()
}
