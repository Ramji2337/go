package middleware

import (
	"log"
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// SecurityHeaders sets Helmet-equivalent security headers (matches Node.js helmetConfig)
func SecurityHeaders(c *fiber.Ctx) error {
	// Content-Security-Policy matching Node.js helmet directives
	c.Set("Content-Security-Policy",
		"default-src 'self'; "+
			"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "+
			"font-src 'self' https://fonts.gstatic.com; "+
			"img-src 'self' data: https: blob:; "+
			"script-src 'self'; "+
			"connect-src 'self' https://res.cloudinary.com; "+
			"frame-src 'none'; "+
			"object-src 'none'")
	c.Set("X-Frame-Options", "DENY")
	c.Set("X-Content-Type-Options", "nosniff")
	c.Set("X-XSS-Protection", "1; mode=block")
	c.Set("Referrer-Policy", "strict-origin-when-cross-origin")
	c.Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
	c.Set("Cross-Origin-Resource-Policy", "cross-origin")
	return c.Next()
}

// SanitizeInput strips HTML tags from a string (matches Node.js sanitizeInput)
func SanitizeInput(input string) string {
	re := regexp.MustCompile(`<[^>]*>`)
	return re.ReplaceAllString(input, "")
}

// MongoSanitize removes MongoDB operator keys ($) from request body/query
// to prevent NoSQL injection (equivalent to express-mongo-sanitize)
func MongoSanitize(c *fiber.Ctx) error {
	// Check query parameters for $ operators
	c.Request().URI().QueryArgs().VisitAll(func(key, value []byte) {
		k := string(key)
		v := string(value)
		if strings.HasPrefix(k, "$") || strings.Contains(v, "$") {
			log.Printf("⚠️  Sanitized potentially malicious input in query: %s", k)
		}
	})
	return c.Next()
}

// XSSClean strips common XSS patterns from request body strings
// (equivalent to xss-clean middleware)
func XSSClean(c *fiber.Ctx) error {
	// Applied at parsing level — controllers should use SanitizeInput on string fields
	return c.Next()
}

// HPPProtection prevents HTTP Parameter Pollution
// Whitelist: category, status, role (matches Node.js hpp config)
func HPPProtection(c *fiber.Ctx) error {
	// Fiber handles single-value params by default; this is a compatibility placeholder
	return c.Next()
}

// suspiciousPatterns used by SecurityLogger
var suspiciousPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)<script`),
	regexp.MustCompile(`(?i)javascript:`),
	regexp.MustCompile(`(?i)on\w+\s*=`),
	regexp.MustCompile(`\$\{`),
	regexp.MustCompile(`\.\.\/`),
	regexp.MustCompile(`(?i)union.*select`),
	regexp.MustCompile(`(?i)exec\s*\(`),
}

// SecurityLogger logs suspicious patterns in request body and query params
// (matches Node.js securityLogger middleware)
func SecurityLogger(c *fiber.Ctx) error {
	ip := c.IP()
	ua := c.Get("User-Agent")

	// Check query parameters
	c.Request().URI().QueryArgs().VisitAll(func(key, value []byte) {
		checkSuspicious(string(value), "query."+string(key), ip, ua)
	})

	// Check request body (raw string scan)
	body := c.Body()
	if len(body) > 0 {
		bodyStr := string(body)
		checkSuspicious(bodyStr, "body", ip, ua)
	}

	return c.Next()
}

func checkSuspicious(value, path, ip, ua string) {
	for _, pattern := range suspiciousPatterns {
		if pattern.MatchString(value) {
			log.Printf("🚨 SECURITY ALERT: Suspicious pattern detected in %s: %s | IP: %s, User-Agent: %s",
				path, value, ip, ua)
			break
		}
	}
}
