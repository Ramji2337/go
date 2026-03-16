package routes

import (
	"go-backend/controllers"
	"go-backend/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupAuthRoutes(app *fiber.App) {
	auth := app.Group("/api/auth")
	auth.Post("/register", controllers.Register)
	auth.Post("/login", controllers.Login)
	auth.Post("/logout", controllers.Logout)
	auth.Post("/verify-email", controllers.VerifyEmail)
	auth.Get("/verify-email", controllers.VerifyEmail)
	auth.Post("/resend-verification", controllers.ResendVerification)
	auth.Post("/forgot-password", controllers.ForgotPassword)
	auth.Post("/reset-password", controllers.ResetPassword)
	auth.Get("/me", middleware.VerifyJWT, controllers.GetCurrentUser)
	auth.Get("/check-acceptance", controllers.CheckAcceptanceStatus)
	auth.Put("/update-country", middleware.VerifyJWT, controllers.UpdateUserCountry)
}
