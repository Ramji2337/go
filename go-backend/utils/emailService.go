package utils

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	gomail "gopkg.in/gomail.v2"
)

func createDialer() *gomail.Dialer {
	host := os.Getenv("SMTP_HOST")
	if host == "" {
		host = "smtp.gmail.com"
	}
	portStr := os.Getenv("SMTP_PORT")
	port := 587
	if portStr != "" {
		if p, err := strconv.Atoi(portStr); err == nil {
			port = p
		}
	}
	user := os.Getenv("SMTP_USER")
	pass := os.Getenv("SMTP_PASS")
	d := gomail.NewDialer(host, port, user, pass)
	return d
}

func sendEmail(to, subject, body string) error {
	from := os.Getenv("FROM_EMAIL")
	if from == "" {
		from = os.Getenv("SMTP_USER")
	}

	m := gomail.NewMessage()
	m.SetHeader("From", from)
	m.SetHeader("To", to)
	m.SetHeader("Subject", subject)
	m.SetBody("text/html", body)

	d := createDialer()
	if err := d.DialAndSend(m); err != nil {
		log.Printf("Failed to send email to %s: %v", to, err)
		return err
	}
	return nil
}

func frontendURL() string {
	url := os.Getenv("FRONTEND_URL")
	if url == "" {
		url = "http://localhost:5173"
	}
	return url
}

// FrontendURL is the exported version of frontendURL for use in other packages.
func FrontendURL() string {
	return frontendURL()
}

func SendVerificationEmail(email, token string) error {
	verifyURL := fmt.Sprintf("%s/verify-email?token=%s", frontendURL(), token)
	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">Email Verification</h2>
  <p>Thank you for registering for ICMBNT 2026. Please verify your email address by clicking the button below:</p>
  <a href="%s" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 16px 0;">Verify Email</a>
  <p>Or copy and paste this link: <a href="%s">%s</a></p>
  <p>This link expires in 48 hours.</p>
  <p>If you did not create an account, please ignore this email.</p>
</body>
</html>`, verifyURL, verifyURL, verifyURL)

	return sendEmail(email, "Verify Your Email - ICMBNT 2026", body)
}

func SendOTPEmail(email, otp string) error {
	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">Password Reset OTP</h2>
  <p>You requested a password reset for your ICMBNT 2026 account.</p>
  <p>Your OTP is:</p>
  <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1d4ed8; margin: 20px 0; padding: 16px; background: #eff6ff; border-radius: 8px; text-align: center;">%s</div>
  <p>This OTP is valid for 10 minutes.</p>
  <p>If you did not request a password reset, please ignore this email.</p>
</body>
</html>`, otp)

	return sendEmail(email, "Password Reset OTP - ICMBNT 2026", body)
}

type PaperSubmissionData struct {
	Email        string
	AuthorName   string
	SubmissionId string
	PaperTitle   string
	Category     string
	Topic        string
}

func SendPaperSubmissionEmail(data PaperSubmissionData) error {
	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">Paper Submission Confirmation</h2>
  <p>Dear %s,</p>
  <p>Your paper has been successfully submitted to ICMBNT 2026.</p>
  <table style="width: 100%%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Submission ID</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Paper Title</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Category</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
  </table>
  <p>Please keep your Submission ID for future reference.</p>
  <p>You will be notified about the status of your paper via email.</p>
</body>
</html>`, data.AuthorName, data.SubmissionId, data.PaperTitle, data.Category)

	return sendEmail(data.Email, fmt.Sprintf("Paper Submission Confirmed - %s", data.SubmissionId), body)
}

func SendAdminNotificationEmail(data PaperSubmissionData) error {
	adminEmail := os.Getenv("SMTP_USER")
	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2>New Paper Submission - ICMBNT 2026</h2>
  <p>A new paper has been submitted.</p>
  <table style="width: 100%%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Submission ID</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Author</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Email</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Paper Title</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Category</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
  </table>
</body>
</html>`, data.SubmissionId, data.AuthorName, data.Email, data.PaperTitle, data.Category)

	return sendEmail(adminEmail, fmt.Sprintf("New Paper Submission: %s", data.SubmissionId), body)
}

type EditorPaperData struct {
	SubmissionId string
	PaperTitle   string
	AuthorName   string
	Category     string
	PdfUrl       string
}

func SendEditorAssignmentEmail(editorEmail, editorName string, paper EditorPaperData) error {
	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">New Paper Assignment</h2>
  <p>Dear %s,</p>
  <p>You have been assigned a new paper to review and manage.</p>
  <table style="width: 100%%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Submission ID</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Paper Title</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Author</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Category</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
  </table>
  <p>Please log in to your editor dashboard to manage this paper.</p>
  <a href="%s/editor/dashboard" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Go to Dashboard</a>
</body>
</html>`, editorName, paper.SubmissionId, paper.PaperTitle, paper.AuthorName, paper.Category, frontendURL())

	return sendEmail(editorEmail, fmt.Sprintf("New Paper Assigned: %s", paper.SubmissionId), body)
}

func SendEditorCredentialsEmail(email, username, password string) error {
	loginURL := fmt.Sprintf("%s/login", frontendURL())
	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">Your Editor Account - ICMBNT 2026</h2>
  <p>Dear %s,</p>
  <p>An editor account has been created for you on the ICMBNT 2026 Paper Management System.</p>
  <table style="width: 100%%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Email</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Password</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
  </table>
  <p>Please change your password after your first login.</p>
  <a href="%s" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Login Now</a>
</body>
</html>`, username, email, password, loginURL)

	return sendEmail(email, "Editor Account Created - ICMBNT 2026", body)
}

func SendEditorMessageEmail(editorEmail, editorName, message string) error {
	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">Message from Admin - ICMBNT 2026</h2>
  <p>Dear %s,</p>
  <p>You have received a message from the conference administration:</p>
  <div style="background: #f8fafc; padding: 16px; border-left: 4px solid #2563eb; margin: 16px 0;">%s</div>
  <p>Please log in to your dashboard for more details.</p>
</body>
</html>`, editorName, message)

	return sendEmail(editorEmail, "Message from Admin - ICMBNT 2026", body)
}

type ReviewerPaperData struct {
	SubmissionId string
	PaperTitle   string
	Category     string
	Abstract     string
	Deadline     time.Time
}

func SendReviewerConfirmationEmail(reviewerEmail, reviewerName string, paper ReviewerPaperData, assignmentID string) error {
	acceptURL := fmt.Sprintf("%s/reviewer/assignment/%s?action=accept", frontendURL(), assignmentID)
	rejectURL := fmt.Sprintf("%s/reviewer/assignment/%s?action=reject", frontendURL(), assignmentID)
	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">Review Assignment Request - ICMBNT 2026</h2>
  <p>Dear %s,</p>
  <p>You have been invited to review a paper submitted to ICMBNT 2026.</p>
  <table style="width: 100%%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Submission ID</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Paper Title</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Category</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Deadline</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
  </table>
  %s
  <p>Please indicate your availability:</p>
  <a href="%s" style="display: inline-block; background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-right: 8px;">Accept</a>
  <a href="%s" style="display: inline-block; background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Decline</a>
</body>
</html>`,
		reviewerName, paper.SubmissionId, paper.PaperTitle, paper.Category,
		paper.Deadline.Format("January 2, 2006"),
		func() string {
			if paper.Abstract != "" {
				return fmt.Sprintf(`<div style="background: #f8fafc; padding: 16px; border-radius: 4px; margin: 16px 0;"><strong>Abstract:</strong><p>%s</p></div>`, paper.Abstract)
			}
			return ""
		}(),
		acceptURL, rejectURL)

	return sendEmail(reviewerEmail, fmt.Sprintf("Review Invitation: %s", paper.SubmissionId), body)
}

func SendReviewerCredentialsEmail(email, username, password, loginURL string) error {
	if loginURL == "" {
		loginURL = fmt.Sprintf("%s/login", frontendURL())
	}
	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">Your Reviewer Account - ICMBNT 2026</h2>
  <p>Dear %s,</p>
  <p>A reviewer account has been created for you on the ICMBNT 2026 Paper Management System.</p>
  <table style="width: 100%%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Email</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Password</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
  </table>
  <p>Please change your password after your first login.</p>
  <a href="%s" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Login Now</a>
</body>
</html>`, username, email, password, loginURL)

	return sendEmail(email, "Reviewer Account Created - ICMBNT 2026", body)
}

func SendReviewerReminderEmail(reviewerEmail, reviewerName, paperTitle string, reminderCount int, reviewLink string, daysRemaining int) error {
	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #f59e0b;">Review Reminder - ICMBNT 2026</h2>
  <p>Dear %s,</p>
  <p>This is a reminder that you have a pending review for:</p>
  <p><strong>%s</strong></p>
  <p>You have <strong>%d day(s)</strong> remaining to submit your review.</p>
  <a href="%s" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Submit Review</a>
  <p style="color: #6b7280; font-size: 0.875rem;">This is reminder #%d</p>
</body>
</html>`, reviewerName, paperTitle, daysRemaining, reviewLink, reminderCount)

	return sendEmail(reviewerEmail, fmt.Sprintf("Review Reminder: %s", paperTitle), body)
}

type DecisionData struct {
	SubmissionId string
	PaperTitle   string
	Decision     string
	Comments     string
	Corrections  string
}

func SendDecisionEmail(authorEmail, authorName string, data DecisionData) error {
	var statusColor, statusText string
	switch data.Decision {
	case "Accept":
		statusColor = "#16a34a"
		statusText = "Accepted"
	case "Reject":
		statusColor = "#dc2626"
		statusText = "Rejected"
	case "Conditionally Accept":
		statusColor = "#d97706"
		statusText = "Conditionally Accepted"
	default:
		statusColor = "#d97706"
		statusText = data.Decision
	}

	commentsHTML := ""
	if data.Comments != "" {
		commentsHTML = fmt.Sprintf(`<div style="margin: 16px 0;"><strong>Editor Comments:</strong><p style="background: #f8fafc; padding: 16px; border-radius: 4px;">%s</p></div>`, data.Comments)
	}

	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">Paper Decision Notification - ICMBNT 2026</h2>
  <p>Dear %s,</p>
  <p>We have a decision regarding your submitted paper.</p>
  <table style="width: 100%%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Submission ID</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Paper Title</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Decision</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0; color: %s;"><strong>%s</strong></td></tr>
  </table>
  %s
  <p>Please log in to your dashboard for more details.</p>
  <a href="%s/dashboard" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">View Dashboard</a>
</body>
</html>`, authorName, data.SubmissionId, data.PaperTitle, statusColor, statusText, commentsHTML, frontendURL())

	return sendEmail(authorEmail, fmt.Sprintf("Paper Decision: %s - %s", statusText, data.SubmissionId), body)
}

func SendAcceptanceEmail(authorEmail, authorName, paperTitle, submissionId string) error {
	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #16a34a;">🎉 Paper Accepted - ICMBNT 2026</h2>
  <p>Dear %s,</p>
  <p>Congratulations! We are pleased to inform you that your paper has been accepted for ICMBNT 2026.</p>
  <table style="width: 100%%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Paper Title</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Submission ID</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
  </table>
  <p>Please log in to complete the copyright form and register for the conference.</p>
  <a href="%s/dashboard" style="display: inline-block; background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Go to Dashboard</a>
</body>
</html>`, authorName, paperTitle, submissionId, frontendURL())

	return sendEmail(authorEmail, fmt.Sprintf("Paper Accepted: %s - ICMBNT 2026", submissionId), body)
}

func SendRevisionRequestEmail(authorEmail, authorName string, data map[string]interface{}) error {
	submissionId, _ := data["submissionId"].(string)
	paperTitle, _ := data["paperTitle"].(string)
	comments, _ := data["editorComments"].(string)

	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #d97706;">Revision Required - ICMBNT 2026</h2>
  <p>Dear %s,</p>
  <p>Your paper requires revision before a final decision can be made.</p>
  <table style="width: 100%%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Submission ID</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Paper Title</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
  </table>
  <div style="background: #fef3c7; padding: 16px; border-left: 4px solid #d97706; margin: 16px 0;"><strong>Editor Comments:</strong><p>%s</p></div>
  <p>Please log in to your dashboard to submit your revised paper.</p>
  <a href="%s/dashboard" style="display: inline-block; background-color: #d97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Submit Revision</a>
</body>
</html>`, authorName, submissionId, paperTitle, comments, frontendURL())

	return sendEmail(authorEmail, fmt.Sprintf("Revision Required: %s", submissionId), body)
}

func SendReReviewEmail(reviewerEmail, reviewerName string, paperData map[string]interface{}) error {
	submissionId, _ := paperData["submissionId"].(string)
	paperTitle, _ := paperData["paperTitle"].(string)

	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">Re-Review Request - ICMBNT 2026</h2>
  <p>Dear %s,</p>
  <p>The author has submitted a revised version of their paper. You are requested to re-review it.</p>
  <table style="width: 100%%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Submission ID</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Paper Title</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
  </table>
  <a href="%s/reviewer/dashboard" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Review Now</a>
</body>
</html>`, reviewerName, submissionId, paperTitle, frontendURL())

	return sendEmail(reviewerEmail, fmt.Sprintf("Re-Review Request: %s", submissionId), body)
}

func SendReviewerAcceptanceEmail(reviewerEmail, reviewerName string, paperData map[string]interface{}) error {
	submissionId, _ := paperData["submissionId"].(string)
	paperTitle, _ := paperData["paperTitle"].(string)

	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #16a34a;">Review Assignment Accepted</h2>
  <p>Dear %s,</p>
  <p>Thank you for accepting the review assignment for paper: <strong>%s</strong> (ID: %s).</p>
  <p>Please log in to your reviewer dashboard to access the paper and submit your review.</p>
  <a href="%s/reviewer/dashboard" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Go to Dashboard</a>
</body>
</html>`, reviewerName, paperTitle, submissionId, frontendURL())

	return sendEmail(reviewerEmail, "Review Assignment Confirmed - ICMBNT 2026", body)
}

func SendReviewerRejectionNotification(reviewerEmail, reviewerName string, paperData map[string]interface{}, reason string) error {
	submissionId, _ := paperData["submissionId"].(string)
	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2>Review Assignment Declined</h2>
  <p>Dear %s,</p>
  <p>Thank you for informing us that you are unable to review paper %s.</p>
  <p>Reason: %s</p>
  <p>We understand and will reassign the paper to another reviewer.</p>
</body>
</html>`, reviewerName, submissionId, reason)

	return sendEmail(reviewerEmail, "Review Assignment Declined - ICMBNT 2026", body)
}

func SendSelectionEmail(authorEmail, authorName string, paperData map[string]interface{}) error {
	submissionId, _ := paperData["submissionId"].(string)
	paperTitle, _ := paperData["paperTitle"].(string)

	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #16a34a;">🎉 Congratulations! Selected for ICMBNT 2026</h2>
  <p>Dear %s,</p>
  <p>We are delighted to inform you that your paper has been selected for presentation at ICMBNT 2026.</p>
  <table style="width: 100%%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Paper Title</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Submission ID</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
  </table>
  <p>Please complete the registration process to confirm your participation.</p>
  <a href="%s/dashboard" style="display: inline-block; background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Complete Registration</a>
</body>
</html>`, authorName, paperTitle, submissionId, frontendURL())

	return sendEmail(authorEmail, "Selected for ICMBNT 2026 - Congratulations!", body)
}

type ListenerData struct {
	Email              string
	Name               string
	Institution        string
	Amount             float64
	Currency           string
	RegistrationCategory string
	TransactionId      string
	VerificationNotes  string
	Status             string
}

func SendListenerPaymentVerificationEmail(data ListenerData) error {
	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #16a34a;">Payment Verified - ICMBNT 2026</h2>
  <p>Dear %s,</p>
  <p>Your registration payment has been verified. You are now officially registered for ICMBNT 2026.</p>
  <table style="width: 100%%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Name</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Institution</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Registration Category</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Amount Paid</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s %.2f</td></tr>
  </table>
</body>
</html>`, data.Name, data.Name, data.Institution, data.RegistrationCategory, data.Currency, data.Amount)

	return sendEmail(data.Email, "Payment Verified - ICMBNT 2026 Registration Confirmed", body)
}

func SendPaymentRejectionEmail(data ListenerData) error {
	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #dc2626;">Payment Verification Failed - ICMBNT 2026</h2>
  <p>Dear %s,</p>
  <p>Unfortunately, we were unable to verify your payment for ICMBNT 2026 registration.</p>
  <p>Reason: %s</p>
  <p>Please contact support or resubmit your payment details.</p>
</body>
</html>`, data.Name, data.VerificationNotes)

	return sendEmail(data.Email, "Payment Verification Failed - ICMBNT 2026", body)
}

func SendRegistrationConfirmationEmail(data map[string]interface{}) error {
	email, _ := data["email"].(string)
	name, _ := data["name"].(string)
	registrationCategory, _ := data["registrationCategory"].(string)

	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2563eb;">Registration Confirmation - ICMBNT 2026</h2>
  <p>Dear %s,</p>
  <p>Your registration for ICMBNT 2026 has been received.</p>
  <p><strong>Registration Category:</strong> %s</p>
  <p>Your payment is under review. You will be notified once it is verified.</p>
</body>
</html>`, name, registrationCategory)

	return sendEmail(email, "Registration Received - ICMBNT 2026", body)
}

func SendReviewSubmissionEmail(editorEmail, editorName, submissionId, reviewerName, recommendation string, overallRating int) error {
	stars := ""
	for i := 1; i <= 5; i++ {
		if i <= overallRating {
			stars += "★"
		} else {
			stars += "☆"
		}
	}

	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #16a34a;">✅ Review Submitted</h2>
  <p>Dear %s,</p>
  <p>A reviewer has submitted their review for a paper assigned to you.</p>
  <table style="width: 100%%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Submission ID</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Reviewer Name</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Recommendation</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Overall Rating</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0; font-size: 18px; color: #d97706;">%s (%d/5)</td></tr>
  </table>
  <p>Please log in to your editor dashboard to view the full review details.</p>
  <a href="%s/editor/dashboard" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Go to Dashboard</a>
</body>
</html>`, editorName, submissionId, reviewerName, recommendation, stars, overallRating, frontendURL())

	return sendEmail(editorEmail, fmt.Sprintf("Review Submitted: %s", submissionId), body)
}

func SendReviewerAssignmentWithAcceptance(reviewerEmail, reviewerName, submissionId, paperTitle, category, deadline, acceptanceToken string) error {
	feURL := frontendURL()
	acceptURL := fmt.Sprintf("%s/reviewer-accept?token=%s", feURL, acceptanceToken)
	declineURL := fmt.Sprintf("%s/reviewer-reject?token=%s", feURL, acceptanceToken)

	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #fef3c7; border: 1px solid #d97706; padding: 12px 16px; border-radius: 4px; margin-bottom: 16px; text-align: center; font-weight: bold; color: #92400e;">[ACTION REQUIRED] Review Assignment Invitation</div>
  <h2 style="color: #2563eb;">Review Assignment - ICMBNT 2026</h2>
  <p>Dear %s,</p>
  <p>You have been invited to review a paper submitted to ICMBNT 2026. Please review the details below and indicate whether you accept or decline this assignment.</p>
  <table style="width: 100%%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Submission ID</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Paper Title</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Category</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Deadline</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
  </table>
  <div style="text-align: center; margin: 24px 0;">
    <a href="%s" style="display: inline-block; background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-right: 8px;">Accept Assignment</a>
    <a href="%s" style="display: inline-block; background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Decline Assignment</a>
  </div>
  <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 12px 16px; margin: 16px 0;">
    <strong>If You Accept:</strong>
    <p style="margin: 8px 0 0 0;">You will gain access to the paper and be expected to submit your review by the deadline indicated above. Please ensure your review is thorough and constructive.</p>
  </div>
  <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; margin: 16px 0;">
    <strong>If You Decline:</strong>
    <p style="margin: 8px 0 0 0;">The paper will be reassigned to another reviewer. We appreciate you letting us know promptly so we can maintain the review timeline.</p>
  </div>
  <div style="background: #f8fafc; padding: 16px; border-radius: 4px; margin: 16px 0;">
    <strong>Review Guidelines:</strong>
    <ul style="margin: 8px 0 0 0; padding-left: 20px;">
      <li>Evaluate the paper objectively based on originality, methodology, and clarity.</li>
      <li>Provide constructive feedback to help the authors improve their work.</li>
      <li>Submit your review before the deadline.</li>
      <li>Maintain confidentiality of the manuscript.</li>
    </ul>
  </div>
</body>
</html>`, reviewerName, submissionId, paperTitle, category, deadline, acceptURL, declineURL)

	return sendEmail(reviewerEmail, fmt.Sprintf("Review Invitation: %s - ICMBNT 2026", submissionId), body)
}

func SendReviewerThankYouEmail(reviewerEmail, reviewerName, submissionId, paperTitle, submittedAt string) error {
	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #16a34a;">✓ Thank You for Your Review</h2>
  <p>Dear %s,</p>
  <p>Thank you for submitting your review. Your expertise and time are greatly valued by the ICMBNT 2026 committee.</p>
  <table style="width: 100%%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Paper Title</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Submission ID</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Submitted On</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
  </table>
  <p>Your review has been recorded and will be considered by the editor when making a decision on this paper.</p>
  <p>If you have any questions or need to update your review, please contact the editorial team.</p>
  <p style="margin-top: 24px;">Best regards,<br>ICMBNT 2026 Organizing Committee</p>
</body>
</html>`, reviewerName, paperTitle, submissionId, submittedAt)

	return sendEmail(reviewerEmail, fmt.Sprintf("Thank You for Your Review - %s", submissionId), body)
}

func SendPaperAcceptedEmail(email, submissionId, paperTitle, authorName, category string) error {
	copyrightURL := fmt.Sprintf("%s/copyright-dashboard", frontendURL())

	body := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #16a34a;">🎉 Congratulations!</h2>
  <p>Dear %s,</p>
  <p>We are pleased to inform you that your paper has been accepted for ICMBNT 2026.</p>
  <table style="width: 100%%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Submission ID</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Paper Title</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Category</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">%s</td></tr>
  </table>
  <p>Please proceed to complete the copyright form to finalize your submission.</p>
  <a href="%s" style="display: inline-block; background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">Complete Copyright Form</a>
  <p style="margin-top: 16px;">If you have any questions, please contact the conference organizing committee.</p>
</body>
</html>`, authorName, submissionId, paperTitle, category, copyrightURL)

	return sendEmail(email, fmt.Sprintf("Paper Accepted: %s - ICMBNT 2026", submissionId), body)
}
