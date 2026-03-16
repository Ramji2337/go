package routes

import (
	"go-backend/controllers"
	"go-backend/middleware"

	"github.com/gofiber/fiber/v2"
)

func SetupPaperRoutes(app *fiber.App) {
	papers := app.Group("/api/papers", middleware.VerifyJWT)
	papers.Get("/count", controllers.GetSubmittedPaperCount)
	papers.Post("/submit", controllers.SubmitPaper)
	papers.Post("/submit-multiple", controllers.SubmitMultiplePaper)
	papers.Get("/my-submission", controllers.GetUserSubmission)
	papers.Get("/check-selection", controllers.CheckFinalSelection)
	papers.Put("/edit/:submissionId", controllers.EditSubmission)
	papers.Post("/submit-revision", controllers.SubmitRevision)
	papers.Post("/reupload/:submissionId", controllers.SubmitRevision)
	papers.Get("/status/:submissionId", controllers.GetPaperStatus)
	papers.Get("/all", middleware.RequireRole("Admin", "Editor"), controllers.GetAllPapersAdmin)
	papers.Get("/:id", middleware.RequireRole("Admin", "Editor", "Reviewer"), controllers.GetPaperById)
}
