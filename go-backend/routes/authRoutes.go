package routes

import (
	"go-backend/controllers"
	"go-backend/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupAuthRoutes(app *fiber.App) {
	auth := app.Group("/api/auth")
	auth.Post("/register", controllers.Register)
	auth.Post("/signin", controllers.Register) // Alias for /register
	auth.Post("/login", controllers.Login)
	auth.Post("/logout", controllers.Logout)
	auth.Post("/verify-email", controllers.VerifyEmail)
	auth.Get("/verify-email", controllers.VerifyEmail)
	auth.Post("/verify-email-token", controllers.VerifyEmail) // Alias for /verify-email
	auth.Post("/resend-verification", controllers.ResendVerification)
	auth.Post("/forgot-password", controllers.ForgotPassword)
	auth.Post("/reset-password", controllers.ResetPassword)
	auth.Get("/me", middleware.VerifyJWT, controllers.GetCurrentUser)
	auth.Get("/check-acceptance", controllers.CheckAcceptanceStatus)
	auth.Get("/check-acceptance-status", controllers.CheckAcceptanceStatus) // Alias for /check-acceptance
	auth.Put("/update-country", middleware.VerifyJWT, controllers.UpdateUserCountry)
}
