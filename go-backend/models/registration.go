package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type PaymentRegistration struct {
	ID                   primitive.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	UserId               primitive.ObjectID `bson:"userId,omitempty" json:"userId,omitempty"`
	AuthorEmail          string             `bson:"authorEmail" json:"authorEmail"`
	AuthorName           string             `bson:"authorName" json:"authorName"`
	PaperId              primitive.ObjectID `bson:"paperId,omitempty" json:"paperId,omitempty"`
	SubmissionId         string             `bson:"submissionId,omitempty" json:"submissionId,omitempty"`
	PaperTitle           string             `bson:"paperTitle" json:"paperTitle"`
	PaperUrl             string             `bson:"paperUrl,omitempty" json:"paperUrl,omitempty"`
	Institution          string             `bson:"institution" json:"institution"`
	Address              string             `bson:"address" json:"address"`
	Country              string             `bson:"country" json:"country"`
	PaymentMethod        string             `bson:"paymentMethod" json:"paymentMethod"`
	TransactionId        string             `bson:"transactionId,omitempty" json:"transactionId,omitempty"`
	Amount               float64            `bson:"amount" json:"amount"`
	Currency             string             `bson:"currency" json:"currency"`
	PaymentScreenshot    string             `bson:"paymentScreenshot,omitempty" json:"paymentScreenshot,omitempty"`
	PaymentScreenshotPublicId string         `bson:"paymentScreenshotPublicId,omitempty" json:"paymentScreenshotPublicId,omitempty"`
	PaymentStatus        string             `bson:"paymentStatus" json:"paymentStatus"`
	VerifiedBy           primitive.ObjectID `bson:"verifiedBy,omitempty" json:"verifiedBy,omitempty"`
	VerifiedAt           *time.Time         `bson:"verifiedAt,omitempty" json:"verifiedAt,omitempty"`
	VerificationNotes    string             `bson:"verificationNotes,omitempty" json:"verificationNotes,omitempty"`
	RejectionReason      string             `bson:"rejectionReason,omitempty" json:"rejectionReason,omitempty"`
	RegistrationCategory string             `bson:"registrationCategory" json:"registrationCategory"`
	RegistrationDate     time.Time          `bson:"registrationDate" json:"registrationDate"`
	CreatedAt            time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt            time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type PaymentDoneFinalUser struct {
	ID                   primitive.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	UserId               primitive.ObjectID `bson:"userId,omitempty" json:"userId,omitempty"`
	AuthorEmail          string             `bson:"authorEmail" json:"authorEmail"`
	AuthorName           string             `bson:"authorName" json:"authorName"`
	PaperId              primitive.ObjectID `bson:"paperId,omitempty" json:"paperId,omitempty"`
	SubmissionId         string             `bson:"submissionId,omitempty" json:"submissionId,omitempty"`
	PaperTitle           string             `bson:"paperTitle" json:"paperTitle"`
	PaperUrl             string             `bson:"paperUrl,omitempty" json:"paperUrl,omitempty"`
	Institution          string             `bson:"institution" json:"institution"`
	Address              string             `bson:"address" json:"address"`
	Country              string             `bson:"country" json:"country"`
	PaymentMethod        string             `bson:"paymentMethod" json:"paymentMethod"`
	TransactionId        string             `bson:"transactionId,omitempty" json:"transactionId,omitempty"`
	Amount               float64            `bson:"amount" json:"amount"`
	Currency             string             `bson:"currency" json:"currency"`
	PaymentRegistrationId primitive.ObjectID `bson:"paymentRegistrationId" json:"paymentRegistrationId"`
	RegistrationCategory string             `bson:"registrationCategory" json:"registrationCategory"`
	VerifiedBy           primitive.ObjectID `bson:"verifiedBy,omitempty" json:"verifiedBy,omitempty"`
	VerifiedByName       string             `bson:"verifiedByName,omitempty" json:"verifiedByName,omitempty"`
	VerifiedByEmail      string             `bson:"verifiedByEmail,omitempty" json:"verifiedByEmail,omitempty"`
	VerifiedAt           time.Time          `bson:"verifiedAt" json:"verifiedAt"`
	VerificationNotes    string             `bson:"verificationNotes,omitempty" json:"verificationNotes,omitempty"`
	ConferenceYear       int                `bson:"conferenceYear" json:"conferenceYear"`
	ConferenceName       string             `bson:"conferenceName" json:"conferenceName"`
	RegistrationNumber   string             `bson:"registrationNumber,omitempty" json:"registrationNumber,omitempty"`
	CertificateGenerated bool               `bson:"certificateGenerated" json:"certificateGenerated"`
	CertificateNumber    string             `bson:"certificateNumber,omitempty" json:"certificateNumber,omitempty"`
	RegistrationDate     time.Time          `bson:"registrationDate" json:"registrationDate"`
	CreatedAt            time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt            time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type ConferenceSelectedUser struct {
	ID                  primitive.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	AuthorEmail         string             `bson:"authorEmail" json:"authorEmail"`
	AuthorName          string             `bson:"authorName" json:"authorName"`
	PaperTitle          string             `bson:"paperTitle" json:"paperTitle"`
	SubmissionId        string             `bson:"submissionId" json:"submissionId"`
	PaperUrl            string             `bson:"paperUrl" json:"paperUrl"`
	CopyrightUrl        string             `bson:"copyrightUrl" json:"copyrightUrl"`
	SelectionDate       time.Time          `bson:"selectionDate" json:"selectionDate"`
	Status              string             `bson:"status" json:"status"`
	PaymentId           primitive.ObjectID `bson:"paymentId,omitempty" json:"paymentId,omitempty"`
	RegistrationNumber  string             `bson:"registrationNumber,omitempty" json:"registrationNumber,omitempty"`
	Category            string             `bson:"category,omitempty" json:"category,omitempty"`
	Abstract            string             `bson:"abstract,omitempty" json:"abstract,omitempty"`
	EditorEmail         string             `bson:"editorEmail,omitempty" json:"editorEmail,omitempty"`
	Reviewers           []string           `bson:"reviewers,omitempty" json:"reviewers,omitempty"`
	RevisionRounds      int                `bson:"revisionRounds" json:"revisionRounds"`
	FinalDocUrl         string             `bson:"finalDocUrl,omitempty" json:"finalDocUrl,omitempty"`
	FinalDocPublicId    string             `bson:"finalDocPublicId,omitempty" json:"finalDocPublicId,omitempty"`
	FinalDocSubmittedAt *time.Time         `bson:"finalDocSubmittedAt,omitempty" json:"finalDocSubmittedAt,omitempty"`
	PaperSubmittedAt    *time.Time         `bson:"paperSubmittedAt,omitempty" json:"paperSubmittedAt,omitempty"`
	CopyrightSubmittedAt *time.Time        `bson:"copyrightSubmittedAt,omitempty" json:"copyrightSubmittedAt,omitempty"`
	CreatedAt           time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt           time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type ListenerRegistration struct {
	ID                   primitive.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	UserId               primitive.ObjectID `bson:"userId" json:"userId"`
	Email                string             `bson:"email" json:"email"`
	Name                 string             `bson:"name" json:"name"`
	Institution          string             `bson:"institution" json:"institution"`
	Address              string             `bson:"address" json:"address"`
	Country              string             `bson:"country" json:"country"`
	PaymentMethod        string             `bson:"paymentMethod" json:"paymentMethod"`
	TransactionId        string             `bson:"transactionId,omitempty" json:"transactionId,omitempty"`
	Amount               float64            `bson:"amount" json:"amount"`
	Currency             string             `bson:"currency" json:"currency"`
	PaymentScreenshot    string             `bson:"paymentScreenshot,omitempty" json:"paymentScreenshot,omitempty"`
	RegistrationCategory string             `bson:"registrationCategory" json:"registrationCategory"`
	IsScisMember         bool               `bson:"isScisMember" json:"isScisMember"`
	ScisMembershipId     string             `bson:"scisMembershipId,omitempty" json:"scisMembershipId,omitempty"`
	PaymentStatus        string             `bson:"paymentStatus" json:"paymentStatus"`
	VerifiedBy           primitive.ObjectID `bson:"verifiedBy,omitempty" json:"verifiedBy,omitempty"`
	VerifiedByName       string             `bson:"verifiedByName,omitempty" json:"verifiedByName,omitempty"`
	VerifiedByEmail      string             `bson:"verifiedByEmail,omitempty" json:"verifiedByEmail,omitempty"`
	VerifiedAt           *time.Time         `bson:"verifiedAt,omitempty" json:"verifiedAt,omitempty"`
	VerificationNotes    string             `bson:"verificationNotes,omitempty" json:"verificationNotes,omitempty"`
	RejectionReason      string             `bson:"rejectionReason,omitempty" json:"rejectionReason,omitempty"`
	RejectedBy           primitive.ObjectID `bson:"rejectedBy,omitempty" json:"rejectedBy,omitempty"`
	RejectedAt           *time.Time         `bson:"rejectedAt,omitempty" json:"rejectedAt,omitempty"`
	ConferenceYear       int                `bson:"conferenceYear" json:"conferenceYear"`
	ConferenceName       string             `bson:"conferenceName" json:"conferenceName"`
	RegistrationNumber   string             `bson:"registrationNumber,omitempty" json:"registrationNumber,omitempty"`
	CertificateGenerated bool               `bson:"certificateGenerated" json:"certificateGenerated"`
	CertificateNumber    string             `bson:"certificateNumber,omitempty" json:"certificateNumber,omitempty"`
	RegistrationDate     time.Time          `bson:"registrationDate" json:"registrationDate"`
	CreatedAt            time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt            time.Time          `bson:"updatedAt" json:"updatedAt"`
}
