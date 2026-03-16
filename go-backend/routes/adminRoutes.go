package routes

import (
	"go-backend/controllers"
	"go-backend/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupAdminRoutes(app *fiber.App) {
	admin := app.Group("/api/admin", middleware.VerifyJWT, middleware.RequireAdmin)
	admin.Post("/editors", controllers.CreateEditor)
	admin.Get("/editors", controllers.GetAllEditors)
	admin.Post("/editors/message", controllers.SendMessageToEditor)
	admin.Post("/assign-editor", controllers.AssignEditor)
	admin.Post("/reassign-editor", controllers.ReassignEditor)
	admin.Get("/users", controllers.GetAllUsers)
	admin.Delete("/users/:userId", controllers.DeleteUser)
	admin.Get("/dashboard-stats", controllers.GetDashboardStats)
	admin.Get("/selected-users", middleware.RequireRole("Editor", "Admin"), controllers.GetConferenceSelectedUsers)
	admin.Post("/selected-users/send-email", controllers.SendSelectedUserEmail)
	admin.Get("/pdfs", controllers.GetAllPdfsAdmin)
	admin.Delete("/pdfs", controllers.DeletePdfAdmin)
}
