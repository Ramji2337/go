package main

import (
	"log"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/joho/godotenv"

	"go-backend/config"
	mw "go-backend/middleware"
	"go-backend/routes"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	config.ConnectDatabase()
	config.InitCloudinary()

	app := fiber.New(fiber.Config{
		BodyLimit: 10 * 1024 * 1024,
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{
				"success": false,
				"message": err.Error(),
			})
		},
	})

	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(mw.SecurityHeaders)

	allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
	if allowedOrigins == "" {
		allowedOrigins = "http://localhost:5173"
	}
	app.Use(cors.New(cors.Config{
		AllowOrigins:     allowedOrigins,
		AllowCredentials: true,
		AllowMethods:     "GET,POST,PUT,DELETE,PATCH,OPTIONS",
		AllowHeaders:     "Content-Type,Authorization",
	}))

	app.Get("/", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"success": true,
			"message": "ICMBNT 2026 Research Paper Management System API",
			"version": "2.0.0",
		})
	})
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"success":   true,
			"status":    "healthy",
			"timestamp": time.Now().Format(time.RFC3339),
		})
	})

	routes.SetupAuthRoutes(app)
	routes.SetupPaperRoutes(app)
	routes.SetupAdminRoutes(app)
	routes.SetupEditorRoutes(app)
	routes.SetupReviewerRoutes(app)
	routes.SetupCommitteeRoutes(app)
	routes.SetupMembershipRoutes(app)
	routes.SetupListenerRoutes(app)
	routes.SetupDebugRoutes(app)
	routes.SetupCopyrightRoutes(app)
	routes.SetupPaperMessageRoutes(app)
	routes.SetupSupportMessageRoutes(app)
	routes.SetupAdminPaperSubmissionRoutes(app)
	routes.SetupAdminPaperAcceptanceRoutes(app)
	routes.SetupPaymentRegistrationRoutes(app)
	routes.SetupDirectRoutes(app)
	routes.SetupServerRoutes(app)

	app.Use(func(c *fiber.Ctx) error {
		return c.Status(404).JSON(fiber.Map{
			"success": false,
			"message": "Route not found",
		})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "5000"
	}

	log.Printf("🚀 Server starting on port %s", port)
	log.Fatal(app.Listen(":" + port))
}
