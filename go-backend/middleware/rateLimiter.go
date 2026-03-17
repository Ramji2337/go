package middleware

import (
	"os"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
)

// rateLimitEntry tracks request counts per IP
type rateLimitEntry struct {
	count     int
	expiresAt time.Time
}

// RateLimiterStore is an in-memory store for rate limiting
type RateLimiterStore struct {
	mu      sync.Mutex
	entries map[string]*rateLimitEntry
}

// NewRateLimiterStore creates a new store and starts cleanup goroutine
func NewRateLimiterStore() *RateLimiterStore {
	store := &RateLimiterStore{
		entries: make(map[string]*rateLimitEntry),
	}
	go store.cleanup()
	return store
}

func (s *RateLimiterStore) cleanup() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		s.mu.Lock()
		now := time.Now()
		for k, v := range s.entries {
			if now.After(v.expiresAt) {
				delete(s.entries, k)
			}
		}
		s.mu.Unlock()
	}
}

// CreateRateLimiter returns a Fiber middleware that limits requests per IP.
// windowMs: time window in milliseconds, max: max requests per window.
func CreateRateLimiter(windowMs int, max int) fiber.Handler {
	store := NewRateLimiterStore()

	return func(c *fiber.Ctx) error {
		// Skip rate limiting in development for localhost
		if os.Getenv("NODE_ENV") == "development" && c.IP() == "127.0.0.1" {
			return c.Next()
		}

		ip := c.IP()
		now := time.Now()
		window := time.Duration(windowMs) * time.Millisecond

		store.mu.Lock()
		entry, exists := store.entries[ip]
		if !exists || now.After(entry.expiresAt) {
			store.entries[ip] = &rateLimitEntry{
				count:     1,
				expiresAt: now.Add(window),
			}
			store.mu.Unlock()
			return c.Next()
		}

		entry.count++
		if entry.count > max {
			store.mu.Unlock()
			return c.Status(429).JSON(fiber.Map{
				"success": false,
				"message": "Too many requests from this IP, please try again later.",
			})
		}
		store.mu.Unlock()

		return c.Next()
	}
}

// Pre-configured rate limiters matching Node.js security.js

// AuthLimiter - 20 requests per 15 minutes for auth endpoints
var AuthLimiter = CreateRateLimiter(15*60*1000, 20)

// APILimiter - 200 requests per 15 minutes for general API
var APILimiter = CreateRateLimiter(15*60*1000, 200)

// UploadLimiter - 1 upload per hour
var UploadLimiter = CreateRateLimiter(60*60*1000, 1)

// StrictLimiter - 5 requests per 15 minutes for sensitive operations
var StrictLimiter = CreateRateLimiter(15*60*1000, 5)
