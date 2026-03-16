package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type ReviewsByRound struct {
	Round              int                `bson:"round,omitempty" json:"round,omitempty"`
	ReviewerId         primitive.ObjectID `bson:"reviewerId,omitempty" json:"reviewerId,omitempty"`
	ReviewerName       string             `bson:"reviewerName,omitempty" json:"reviewerName,omitempty"`
	ReviewerEmail      string             `bson:"reviewerEmail,omitempty" json:"reviewerEmail,omitempty"`
	Comments           string             `bson:"comments,omitempty" json:"comments,omitempty"`
	CommentsToReviewer string             `bson:"commentsToReviewer,omitempty" json:"commentsToReviewer,omitempty"`
	CommentsToEditor   string             `bson:"commentsToEditor,omitempty" json:"commentsToEditor,omitempty"`
	Strengths          string             `bson:"strengths,omitempty" json:"strengths,omitempty"`
	Weaknesses         string             `bson:"weaknesses,omitempty" json:"weaknesses,omitempty"`
	OverallRating      int                `bson:"overallRating,omitempty" json:"overallRating,omitempty"`
	NoveltyRating      int                `bson:"noveltyRating,omitempty" json:"noveltyRating,omitempty"`
	QualityRating      int                `bson:"qualityRating,omitempty" json:"qualityRating,omitempty"`
	ClarityRating      int                `bson:"clarityRating,omitempty" json:"clarityRating,omitempty"`
	Recommendation     string             `bson:"recommendation,omitempty" json:"recommendation,omitempty"`
	ReviewedPdfUrl     string             `bson:"reviewedPdfUrl,omitempty" json:"reviewedPdfUrl,omitempty"`
	SubmittedAt        *time.Time         `bson:"submittedAt,omitempty" json:"submittedAt,omitempty"`
}

type LegacyReviewer struct {
	ReviewerId    primitive.ObjectID `bson:"reviewerId,omitempty" json:"reviewerId,omitempty"`
	ReviewerName  string             `bson:"reviewerName,omitempty" json:"reviewerName,omitempty"`
	ReviewerEmail string             `bson:"reviewerEmail" json:"reviewerEmail"`
	OverallRating int                `bson:"overallRating,omitempty" json:"overallRating,omitempty"`
	Recommendation string            `bson:"recommendation,omitempty" json:"recommendation,omitempty"`
	SubmittedAt   *time.Time         `bson:"submittedAt,omitempty" json:"submittedAt,omitempty"`
}

type RevisionPdfs struct {
	CleanPdfUrl            string `bson:"cleanPdfUrl,omitempty" json:"cleanPdfUrl,omitempty"`
	CleanPdfPublicId       string `bson:"cleanPdfPublicId,omitempty" json:"cleanPdfPublicId,omitempty"`
	CleanPdfFileName       string `bson:"cleanPdfFileName,omitempty" json:"cleanPdfFileName,omitempty"`
	HighlightedPdfUrl      string `bson:"highlightedPdfUrl,omitempty" json:"highlightedPdfUrl,omitempty"`
	HighlightedPdfPublicId string `bson:"highlightedPdfPublicId,omitempty" json:"highlightedPdfPublicId,omitempty"`
	HighlightedPdfFileName string `bson:"highlightedPdfFileName,omitempty" json:"highlightedPdfFileName,omitempty"`
	ResponsePdfUrl         string `bson:"responsePdfUrl,omitempty" json:"responsePdfUrl,omitempty"`
	ResponsePdfPublicId    string `bson:"responsePdfPublicId,omitempty" json:"responsePdfPublicId,omitempty"`
	ResponsePdfFileName    string `bson:"responsePdfFileName,omitempty" json:"responsePdfFileName,omitempty"`
}

type FinalAcceptanceMetadata struct {
	OriginalSubmissionDate *time.Time `bson:"originalSubmissionDate,omitempty" json:"originalSubmissionDate,omitempty"`
	FirstReviewDate        *time.Time `bson:"firstReviewDate,omitempty" json:"firstReviewDate,omitempty"`
	RevisionRequestDate    *time.Time `bson:"revisionRequestDate,omitempty" json:"revisionRequestDate,omitempty"`
	LastRevisionDate       *time.Time `bson:"lastRevisionDate,omitempty" json:"lastRevisionDate,omitempty"`
	Notes                  string     `bson:"notes,omitempty" json:"notes,omitempty"`
}

type FinalAcceptance struct {
	ID                          primitive.ObjectID      `bson:"_id,omitempty" json:"_id,omitempty"`
	PaperId                     primitive.ObjectID      `bson:"paperId" json:"paperId"`
	SubmissionId                string                  `bson:"submissionId" json:"submissionId"`
	PaperTitle                  string                  `bson:"paperTitle" json:"paperTitle"`
	AuthorName                  string                  `bson:"authorName" json:"authorName"`
	AuthorEmail                 string                  `bson:"authorEmail" json:"authorEmail"`
	PdfUrl                      string                  `bson:"pdfUrl" json:"pdfUrl"`
	PdfPublicId                 string                  `bson:"pdfPublicId,omitempty" json:"pdfPublicId,omitempty"`
	PdfFileName                 string                  `bson:"pdfFileName,omitempty" json:"pdfFileName,omitempty"`
	RevisionPdfs                RevisionPdfs            `bson:"revisionPdfs,omitempty" json:"revisionPdfs,omitempty"`
	ReviewsByRound              []ReviewsByRound        `bson:"reviewsByRound,omitempty" json:"reviewsByRound,omitempty"`
	Category                    string                  `bson:"category" json:"category"`
	Topic                       string                  `bson:"topic,omitempty" json:"topic,omitempty"`
	Reviewers                   []LegacyReviewer        `bson:"reviewers,omitempty" json:"reviewers,omitempty"`
	TotalReviewers              int                     `bson:"totalReviewers" json:"totalReviewers"`
	AverageRating               float64                 `bson:"averageRating" json:"averageRating"`
	FinalDecision               string                  `bson:"finalDecision" json:"finalDecision"`
	EditorId                    primitive.ObjectID      `bson:"editorId,omitempty" json:"editorId,omitempty"`
	EditorEmail                 string                  `bson:"editorEmail,omitempty" json:"editorEmail,omitempty"`
	AcceptanceDate              time.Time               `bson:"acceptanceDate" json:"acceptanceDate"`
	RevisionCount               int                     `bson:"revisionCount" json:"revisionCount"`
	AcceptanceCertificateNumber string                  `bson:"acceptanceCertificateNumber,omitempty" json:"acceptanceCertificateNumber,omitempty"`
	ConferenceYear              int                     `bson:"conferenceYear" json:"conferenceYear"`
	ConferenceName              string                  `bson:"conferenceName" json:"conferenceName"`
	PaymentStatus               string                  `bson:"paymentStatus" json:"paymentStatus"`
	PaymentRegistrationId       primitive.ObjectID      `bson:"paymentRegistrationId,omitempty" json:"paymentRegistrationId,omitempty"`
	Status                      string                  `bson:"status" json:"status"`
	Metadata                    FinalAcceptanceMetadata `bson:"metadata,omitempty" json:"metadata,omitempty"`
	CreatedAt                   time.Time               `bson:"createdAt" json:"createdAt"`
	UpdatedAt                   time.Time               `bson:"updatedAt" json:"updatedAt"`
}

type RejectedPaper struct {
	ID               primitive.ObjectID      `bson:"_id,omitempty" json:"_id,omitempty"`
	PaperId          primitive.ObjectID      `bson:"paperId" json:"paperId"`
	SubmissionId     string                  `bson:"submissionId" json:"submissionId"`
	PaperTitle       string                  `bson:"paperTitle" json:"paperTitle"`
	AuthorName       string                  `bson:"authorName" json:"authorName"`
	AuthorEmail      string                  `bson:"authorEmail" json:"authorEmail"`
	PdfUrl           string                  `bson:"pdfUrl" json:"pdfUrl"`
	PdfPublicId      string                  `bson:"pdfPublicId,omitempty" json:"pdfPublicId,omitempty"`
	PdfFileName      string                  `bson:"pdfFileName,omitempty" json:"pdfFileName,omitempty"`
	RevisionPdfs     RevisionPdfs            `bson:"revisionPdfs,omitempty" json:"revisionPdfs,omitempty"`
	ReviewsByRound   []ReviewsByRound        `bson:"reviewsByRound,omitempty" json:"reviewsByRound,omitempty"`
	Category         string                  `bson:"category" json:"category"`
	Topic            string                  `bson:"topic,omitempty" json:"topic,omitempty"`
	Reviewers        []LegacyReviewer        `bson:"reviewers,omitempty" json:"reviewers,omitempty"`
	TotalReviewers   int                     `bson:"totalReviewers" json:"totalReviewers"`
	AverageRating    float64                 `bson:"averageRating" json:"averageRating"`
	RejectionReason  string                  `bson:"rejectionReason" json:"rejectionReason"`
	RejectionComments string                 `bson:"rejectionComments" json:"rejectionComments"`
	EditorId         primitive.ObjectID      `bson:"editorId" json:"editorId"`
	EditorEmail      string                  `bson:"editorEmail,omitempty" json:"editorEmail,omitempty"`
	EditorName       string                  `bson:"editorName,omitempty" json:"editorName,omitempty"`
	RejectionDate    time.Time               `bson:"rejectionDate" json:"rejectionDate"`
	RevisionCount    int                     `bson:"revisionCount" json:"revisionCount"`
	ConferenceYear   int                     `bson:"conferenceYear" json:"conferenceYear"`
	ConferenceName   string                  `bson:"conferenceName" json:"conferenceName"`
	Metadata         FinalAcceptanceMetadata `bson:"metadata,omitempty" json:"metadata,omitempty"`
	CreatedAt        time.Time               `bson:"createdAt" json:"createdAt"`
	UpdatedAt        time.Time               `bson:"updatedAt" json:"updatedAt"`
}
