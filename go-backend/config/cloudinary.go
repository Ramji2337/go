package config

import (
	"bytes"
	"context"
	"log"
	"os"

	"github.com/cloudinary/cloudinary-go/v2"
	"github.com/cloudinary/cloudinary-go/v2/api/uploader"
)

var CloudinaryClient *cloudinary.Cloudinary

func InitCloudinary() {
	cld, err := cloudinary.NewFromParams(
		os.Getenv("CLOUDINARY_CLOUD_NAME"),
		os.Getenv("CLOUDINARY_API_KEY"),
		os.Getenv("CLOUDINARY_API_SECRET"),
	)
	if err != nil {
		log.Printf("⚠️  Failed to initialize Cloudinary: %v", err)
		return
	}
	CloudinaryClient = cld
	log.Println("✅ Cloudinary initialized successfully")
}

func UploadPDF(ctx context.Context, fileBytes []byte, publicID string) (string, string, error) {
	if CloudinaryClient == nil {
		return "", "", nil
	}

	uploadParams := uploader.UploadParams{
		PublicID:     publicID,
		ResourceType: "raw",
		Folder:       "papers",
	}

	result, err := CloudinaryClient.Upload.Upload(ctx, bytes.NewReader(fileBytes), uploadParams)
	if err != nil {
		return "", "", err
	}

	return result.SecureURL, result.PublicID, nil
}

func DeletePDF(ctx context.Context, publicID string) error {
	if CloudinaryClient == nil {
		return nil
	}

	_, err := CloudinaryClient.Upload.Destroy(ctx, uploader.DestroyParams{
		PublicID:     publicID,
		ResourceType: "raw",
	})
	return err
}
