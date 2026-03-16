package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type User struct {
	ID                  primitive.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	Username            string             `bson:"username" json:"username"`
	Email               string             `bson:"email" json:"email"`
	Password            string             `bson:"password,omitempty" json:"-"`
	Role                string             `bson:"role" json:"role"`
	IsGoogleAuth        bool               `bson:"isGoogleAuth" json:"isGoogleAuth"`
	Verified            bool               `bson:"verified" json:"verified"`
	VerificationToken   string             `bson:"verificationToken,omitempty" json:"verificationToken,omitempty"`
	VerificationExpires *time.Time         `bson:"verificationExpires,omitempty" json:"verificationExpires,omitempty"`
	ResetPasswordOTP    string             `bson:"resetPasswordOTP,omitempty" json:"-"`
	ResetPasswordExpiry *time.Time         `bson:"resetPasswordExpiry,omitempty" json:"-"`
	TempPassword        string             `bson:"tempPassword,omitempty" json:"-"`
	Country             string             `bson:"country,omitempty" json:"country,omitempty"`
	UserType            string             `bson:"userType,omitempty" json:"userType,omitempty"`
	CreatedAt           time.Time          `bson:"createdAt" json:"createdAt"`
}
