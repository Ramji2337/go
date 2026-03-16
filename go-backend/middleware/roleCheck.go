package middleware

import (
	"github.com/gofiber/fiber/v2"
)

func RequireRole(roles ...string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		user, ok := c.Locals("user").(*JWTClaims)
		if !ok || user == nil {
			return c.Status(401).JSON(fiber.Map{
				"success": false,
				"message": "Authentication required",
			})
		}

		for _, role := range roles {
			if user.Role == role {
				return c.Next()
			}
		}

		return c.Status(403).JSON(fiber.Map{
			"success": false,
			"message": "Access denied. Insufficient permissions.",
		})
	}
}

func RequireAdmin(c *fiber.Ctx) error {
	return RequireRole("Admin")(c)
}

func RequireEditor(c *fiber.Ctx) error {
	return RequireRole("Editor", "Admin")(c)
}

func RequireReviewer(c *fiber.Ctx) error {
	return RequireRole("Reviewer", "Admin")(c)
}
