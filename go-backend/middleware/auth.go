package middleware

import (
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

type JWTClaims struct {
	Email    string `json:"email"`
	UserID   string `json:"userId"`
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

func VerifyJWT(c *fiber.Ctx) error {
	token := c.Cookies("token")
	if token == "" {
		auth := c.Get("Authorization")
		token = strings.TrimPrefix(auth, "Bearer ")
	}

	if token == "" {
		return c.Status(401).JSON(fiber.Map{
			"success": false,
			"message": "Access denied. No token provided.",
		})
	}

	claims := &JWTClaims{}
	parsedToken, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (interface{}, error) {
		return []byte(os.Getenv("JWT_SECRET")), nil
	})

	if err != nil || !parsedToken.Valid {
		return c.Status(401).JSON(fiber.Map{
			"success": false,
			"message": "Invalid or expired token",
		})
	}

	c.Locals("user", claims)
	return c.Next()
}

func OptionalJWT(c *fiber.Ctx) error {
	token := c.Cookies("token")
	if token == "" {
		auth := c.Get("Authorization")
		token = strings.TrimPrefix(auth, "Bearer ")
	}

	if token != "" {
		claims := &JWTClaims{}
		parsedToken, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (interface{}, error) {
			return []byte(os.Getenv("JWT_SECRET")), nil
		})
		if err == nil && parsedToken.Valid {
			c.Locals("user", claims)
		}
	}

	return c.Next()
}
