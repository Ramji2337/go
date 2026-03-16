package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type ReviewRatings struct {
	TechnicalQuality    string `bson:"technicalQuality,omitempty" json:"technicalQuality,omitempty"`
	Significance        string `bson:"significance,omitempty" json:"significance,omitempty"`
	Presentation        string `bson:"presentation,omitempty" json:"presentation,omitempty"`
	Relevance           string `bson:"relevance,omitempty" json:"relevance,omitempty"`
	Originality         string `bson:"originality,omitempty" json:"originality,omitempty"`
	AdequacyOfCitations string `bson:"adequacyOfCitations,omitempty" json:"adequacyOfCitations,omitempty"`
	Overall             string `bson:"overall,omitempty" json:"overall,omitempty"`
}

type AdditionalQuestions struct {
	SuggestOwnReferences          bool `bson:"suggestOwnReferences" json:"suggestOwnReferences"`
	RecommendForBestPaperAward    bool `bson:"recommendForBestPaperAward" json:"recommendForBestPaperAward"`
	SuggestAnotherJournal         bool `bson:"suggestAnotherJournal" json:"suggestAnotherJournal"`
	WillingToReviewRevisions      bool `bson:"willingToReviewRevisions" json:"willingToReviewRevisions"`
}

type ReviewFileUrl struct {
	Url      string `bson:"url,omitempty" json:"url,omitempty"`
	PublicId string `bson:"publicId,omitempty" json:"publicId,omitempty"`
	Filename string `bson:"filename,omitempty" json:"filename,omitempty"`
}

type Review struct {
	ID                          primitive.ObjectID  `bson:"_id,omitempty" json:"_id,omitempty"`
	Paper                       primitive.ObjectID  `bson:"paper" json:"paper"`
	Reviewer                    primitive.ObjectID  `bson:"reviewer" json:"reviewer"`
	Ratings                     ReviewRatings       `bson:"ratings,omitempty" json:"ratings,omitempty"`
	AdditionalQuestions         AdditionalQuestions `bson:"additionalQuestions,omitempty" json:"additionalQuestions,omitempty"`
	Recommendation              string              `bson:"recommendation" json:"recommendation"`
	ConfidentialCommentsToEditor string             `bson:"confidentialCommentsToEditor,omitempty" json:"confidentialCommentsToEditor,omitempty"`
	CommentsToAuthor            string              `bson:"commentsToAuthor,omitempty" json:"commentsToAuthor,omitempty"`
	ReviewFileUrls              []ReviewFileUrl     `bson:"reviewFileUrls,omitempty" json:"reviewFileUrls,omitempty"`
	Status                      string              `bson:"status" json:"status"`
	CreatedAt                   time.Time           `bson:"createdAt" json:"createdAt"`
	UpdatedAt                   time.Time           `bson:"updatedAt" json:"updatedAt"`
}

type ReviewerAssignment struct {
	ID                       primitive.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	PaperId                  primitive.ObjectID `bson:"paperId" json:"paperId"`
	SubmissionId             string             `bson:"submissionId" json:"submissionId"`
	ReviewerId               primitive.ObjectID `bson:"reviewerId" json:"reviewerId"`
	ReviewerEmail            string             `bson:"reviewerEmail" json:"reviewerEmail"`
	ReviewerName             string             `bson:"reviewerName" json:"reviewerName"`
	PaperTitle               string             `bson:"paperTitle" json:"paperTitle"`
	Abstract                 string             `bson:"abstract,omitempty" json:"abstract,omitempty"`
	Status                   string             `bson:"status" json:"status"`
	RejectionReason          string             `bson:"rejectionReason,omitempty" json:"rejectionReason,omitempty"`
	AlternativeReviewerEmail string             `bson:"alternativeReviewerEmail,omitempty" json:"alternativeReviewerEmail,omitempty"`
	AlternativeReviewerName  string             `bson:"alternativeReviewerName,omitempty" json:"alternativeReviewerName,omitempty"`
	AcceptanceToken          string             `bson:"acceptanceToken,omitempty" json:"acceptanceToken,omitempty"`
	AcceptanceTokenExpires   *time.Time         `bson:"acceptanceTokenExpires,omitempty" json:"acceptanceTokenExpires,omitempty"`
	AcceptedAt               *time.Time         `bson:"acceptedAt,omitempty" json:"acceptedAt,omitempty"`
	RejectedAt               *time.Time         `bson:"rejectedAt,omitempty" json:"rejectedAt,omitempty"`
	RespondedAt              *time.Time         `bson:"respondedAt,omitempty" json:"respondedAt,omitempty"`
	ReviewDeadline           *time.Time         `bson:"reviewDeadline,omitempty" json:"reviewDeadline,omitempty"`
	CreatedAt                time.Time          `bson:"createdAt" json:"createdAt"`
}

type ConversationMessage struct {
	Sender      string             `bson:"sender" json:"sender"`
	SenderId    primitive.ObjectID `bson:"senderId" json:"senderId"`
	SenderName  string             `bson:"senderName,omitempty" json:"senderName,omitempty"`
	SenderEmail string             `bson:"senderEmail,omitempty" json:"senderEmail,omitempty"`
	Message     string             `bson:"message" json:"message"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
}

type ReviewerMessage struct {
	ID                       primitive.ObjectID    `bson:"_id,omitempty" json:"_id,omitempty"`
	SubmissionId             string                `bson:"submissionId" json:"submissionId"`
	ReviewId                 primitive.ObjectID    `bson:"reviewId,omitempty" json:"reviewId,omitempty"`
	ReviewerId               primitive.ObjectID    `bson:"reviewerId" json:"reviewerId"`
	EditorId                 primitive.ObjectID    `bson:"editorId" json:"editorId"`
	AuthorId                 string                `bson:"authorId" json:"authorId"`
	Conversation             []ConversationMessage `bson:"conversation,omitempty" json:"conversation,omitempty"`
	EditorReviewerConversation bool                `bson:"editorReviewerConversation" json:"editorReviewerConversation"`
	EditorAuthorConversation   bool                `bson:"editorAuthorConversation" json:"editorAuthorConversation"`
	LastMessageAt            time.Time             `bson:"lastMessageAt" json:"lastMessageAt"`
	Status                   string                `bson:"status" json:"status"`
	CreatedAt                time.Time             `bson:"createdAt" json:"createdAt"`
	UpdatedAt                time.Time             `bson:"updatedAt" json:"updatedAt"`
}

type ReviewerReview struct {
	ID                primitive.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	Paper             primitive.ObjectID `bson:"paper" json:"paper"`
	Reviewer          primitive.ObjectID `bson:"reviewer" json:"reviewer"`
	ReviewerName      string             `bson:"reviewerName,omitempty" json:"reviewerName,omitempty"`
	ReviewerEmail     string             `bson:"reviewerEmail,omitempty" json:"reviewerEmail,omitempty"`
	Round             int                `bson:"round" json:"round"`
	Comments          string             `bson:"comments" json:"comments"`
	CommentsToReviewer string            `bson:"commentsToReviewer,omitempty" json:"commentsToReviewer,omitempty"`
	CommentsToEditor  string             `bson:"commentsToEditor,omitempty" json:"commentsToEditor,omitempty"`
	Strengths         string             `bson:"strengths,omitempty" json:"strengths,omitempty"`
	Weaknesses        string             `bson:"weaknesses,omitempty" json:"weaknesses,omitempty"`
	OverallRating     int                `bson:"overallRating" json:"overallRating"`
	NoveltyRating     int                `bson:"noveltyRating,omitempty" json:"noveltyRating,omitempty"`
	QualityRating     int                `bson:"qualityRating,omitempty" json:"qualityRating,omitempty"`
	ClarityRating     int                `bson:"clarityRating,omitempty" json:"clarityRating,omitempty"`
	Recommendation    string             `bson:"recommendation" json:"recommendation"`
	ReviewedPdfUrl    string             `bson:"reviewedPdfUrl,omitempty" json:"reviewedPdfUrl,omitempty"`
	ReviewedPdfPublicId string           `bson:"reviewedPdfPublicId,omitempty" json:"reviewedPdfPublicId,omitempty"`
	Status            string             `bson:"status" json:"status"`
	AssignedAt        time.Time          `bson:"assignedAt" json:"assignedAt"`
	Deadline          *time.Time         `bson:"deadline,omitempty" json:"deadline,omitempty"`
	SubmittedAt       time.Time          `bson:"submittedAt" json:"submittedAt"`
	CreatedAt         time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt         time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type ReviewerComment struct {
	ReviewerId    primitive.ObjectID `bson:"reviewerId,omitempty" json:"reviewerId,omitempty"`
	ReviewerName  string             `bson:"reviewerName,omitempty" json:"reviewerName,omitempty"`
	ReviewerEmail string             `bson:"reviewerEmail,omitempty" json:"reviewerEmail,omitempty"`
	Comments      string             `bson:"comments,omitempty" json:"comments,omitempty"`
	Strengths     string             `bson:"strengths,omitempty" json:"strengths,omitempty"`
	Weaknesses    string             `bson:"weaknesses,omitempty" json:"weaknesses,omitempty"`
	OverallRating int                `bson:"overallRating,omitempty" json:"overallRating,omitempty"`
	NoveltyRating int                `bson:"noveltyRating,omitempty" json:"noveltyRating,omitempty"`
	QualityRating int                `bson:"qualityRating,omitempty" json:"qualityRating,omitempty"`
	ClarityRating int                `bson:"clarityRating,omitempty" json:"clarityRating,omitempty"`
	Recommendation string            `bson:"recommendation,omitempty" json:"recommendation,omitempty"`
}

type Revision struct {
	ID                      primitive.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	SubmissionId            string             `bson:"submissionId" json:"submissionId"`
	RevisionNumber          int                `bson:"revisionNumber" json:"revisionNumber"`
	PaperId                 primitive.ObjectID `bson:"paperId" json:"paperId"`
	AuthorEmail             string             `bson:"authorEmail" json:"authorEmail"`
	AuthorName              string             `bson:"authorName" json:"authorName"`
	EditorEmail             string             `bson:"editorEmail" json:"editorEmail"`
	EditorName              string             `bson:"editorName" json:"editorName"`
	RevisionRequestedAt     time.Time          `bson:"revisionRequestedAt" json:"revisionRequestedAt"`
	RevisionDeadline        time.Time          `bson:"revisionDeadline" json:"revisionDeadline"`
	RevisionStatus          string             `bson:"revisionStatus" json:"revisionStatus"`
	ReviewerComments        []ReviewerComment  `bson:"reviewerComments,omitempty" json:"reviewerComments,omitempty"`
	RevisionMessage         string             `bson:"revisionMessage,omitempty" json:"revisionMessage,omitempty"`
	RevisedPdfUrl           string             `bson:"revisedPdfUrl,omitempty" json:"revisedPdfUrl,omitempty"`
	RevisedPdfPublicId      string             `bson:"revisedPdfPublicId,omitempty" json:"revisedPdfPublicId,omitempty"`
	RevisedPdfFileName      string             `bson:"revisedPdfFileName,omitempty" json:"revisedPdfFileName,omitempty"`
	RevisedPaperSubmittedAt *time.Time         `bson:"revisedPaperSubmittedAt,omitempty" json:"revisedPaperSubmittedAt,omitempty"`
	CleanPdfUrl             string             `bson:"cleanPdfUrl,omitempty" json:"cleanPdfUrl,omitempty"`
	CleanPdfPublicId        string             `bson:"cleanPdfPublicId,omitempty" json:"cleanPdfPublicId,omitempty"`
	CleanPdfFileName        string             `bson:"cleanPdfFileName,omitempty" json:"cleanPdfFileName,omitempty"`
	HighlightedPdfUrl       string             `bson:"highlightedPdfUrl,omitempty" json:"highlightedPdfUrl,omitempty"`
	HighlightedPdfPublicId  string             `bson:"highlightedPdfPublicId,omitempty" json:"highlightedPdfPublicId,omitempty"`
	HighlightedPdfFileName  string             `bson:"highlightedPdfFileName,omitempty" json:"highlightedPdfFileName,omitempty"`
	ResponsePdfUrl          string             `bson:"responsePdfUrl,omitempty" json:"responsePdfUrl,omitempty"`
	ResponsePdfPublicId     string             `bson:"responsePdfPublicId,omitempty" json:"responsePdfPublicId,omitempty"`
	ResponsePdfFileName     string             `bson:"responsePdfFileName,omitempty" json:"responsePdfFileName,omitempty"`
	AuthorResponse          string             `bson:"authorResponse,omitempty" json:"authorResponse,omitempty"`
	AuthorResponseSubmittedAt *time.Time       `bson:"authorResponseSubmittedAt,omitempty" json:"authorResponseSubmittedAt,omitempty"`
	FinalOutcome            string             `bson:"finalOutcome" json:"finalOutcome"`
	RevisionRound           int                `bson:"revisionRound" json:"revisionRound"`
	CreatedAt               time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt               time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type RevisionReview struct {
	ID                 primitive.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	Paper              primitive.ObjectID `bson:"paper" json:"paper"`
	SubmissionId       string             `bson:"submissionId" json:"submissionId"`
	Reviewer           primitive.ObjectID `bson:"reviewer" json:"reviewer"`
	ReviewerEmail      string             `bson:"reviewerEmail,omitempty" json:"reviewerEmail,omitempty"`
	ReviewerName       string             `bson:"reviewerName,omitempty" json:"reviewerName,omitempty"`
	RevisionNumber     int                `bson:"revisionNumber" json:"revisionNumber"`
	Round              int                `bson:"round" json:"round"`
	ReviewedPdfUrl     string             `bson:"reviewedPdfUrl,omitempty" json:"reviewedPdfUrl,omitempty"`
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
	Status             string             `bson:"status" json:"status"`
	SubmittedAt        *time.Time         `bson:"submittedAt,omitempty" json:"submittedAt,omitempty"`
	CreatedAt          time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt          time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type ReReview struct {
	ID                 primitive.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	PaperId            primitive.ObjectID `bson:"paperId" json:"paperId"`
	SubmissionId       string             `bson:"submissionId" json:"submissionId"`
	RevisionId         primitive.ObjectID `bson:"revisionId,omitempty" json:"revisionId,omitempty"`
	ReviewerId         primitive.ObjectID `bson:"reviewerId" json:"reviewerId"`
	ReviewerEmail      string             `bson:"reviewerEmail" json:"reviewerEmail"`
	ReviewerName       string             `bson:"reviewerName" json:"reviewerName"`
	Recommendation     string             `bson:"recommendation" json:"recommendation"`
	OverallRating      int                `bson:"overallRating" json:"overallRating"`
	NoveltyRating      int                `bson:"noveltyRating,omitempty" json:"noveltyRating,omitempty"`
	QualityRating      int                `bson:"qualityRating,omitempty" json:"qualityRating,omitempty"`
	ClarityRating      int                `bson:"clarityRating,omitempty" json:"clarityRating,omitempty"`
	CommentsToEditor   string             `bson:"commentsToEditor,omitempty" json:"commentsToEditor,omitempty"`
	CommentsToReviewer string             `bson:"commentsToReviewer,omitempty" json:"commentsToReviewer,omitempty"`
	Strengths          string             `bson:"strengths,omitempty" json:"strengths,omitempty"`
	Weaknesses         string             `bson:"weaknesses,omitempty" json:"weaknesses,omitempty"`
	SubmittedAt        time.Time          `bson:"submittedAt" json:"submittedAt"`
	UpdatedAt          time.Time          `bson:"updatedAt" json:"updatedAt"`
	Status             string             `bson:"status" json:"status"`
	ReviewRound        int                `bson:"reviewRound" json:"reviewRound"`
	CreatedAt          time.Time          `bson:"createdAt" json:"createdAt"`
}
