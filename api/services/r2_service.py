"""
R2 Storage Service - S3-compatible access to Cloudflare R2
"""

import logging
import boto3
from botocore.config import Config
from io import BytesIO
from typing import Optional, BinaryIO
from config import settings

logger = logging.getLogger(__name__)


class R2Service:
    """Service for interacting with Cloudflare R2 via S3-compatible API"""

    def __init__(self):
        self.client = None
        self._initialize_client()

    def _initialize_client(self):
        """Initialize the S3 client for R2"""
        if not settings.r2_access_key_id or not settings.r2_secret_access_key:
            logger.warning("R2 credentials not configured")
            return

        try:
            self.client = boto3.client(
                's3',
                endpoint_url=settings.r2_endpoint,
                aws_access_key_id=settings.r2_access_key_id,
                aws_secret_access_key=settings.r2_secret_access_key,
                config=Config(
                    signature_version='s3v4',
                    retries={'max_attempts': 3}
                ),
                region_name='auto'
            )
            logger.info("R2 client initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize R2 client: {e}")
            self.client = None

    @property
    def is_available(self) -> bool:
        """Check if R2 is available"""
        return self.client is not None

    def file_exists(self, key: str) -> bool:
        """Check if a file exists in R2 without downloading it"""
        if not self.client:
            logger.error("R2 client not initialized")
            return False

        try:
            self.client.head_object(
                Bucket=settings.r2_bucket_name,
                Key=key
            )
            return True
        except self.client.exceptions.ClientError as e:
            if e.response['Error']['Code'] == '404':
                return False
            logger.error(f"Error checking file existence: {key} - {e}")
            return False
        except Exception as e:
            logger.error(f"Error checking file existence: {key} - {e}")
            return False

    def download_file(self, key: str) -> Optional[BytesIO]:
        """Download a file from R2 and return as BytesIO"""
        if not self.client:
            logger.error("R2 client not initialized")
            return None

        try:
            response = self.client.get_object(
                Bucket=settings.r2_bucket_name,
                Key=key
            )
            data = BytesIO(response['Body'].read())
            logger.info(f"Downloaded file from R2: {key}")
            return data
        except Exception as e:
            logger.error(f"Failed to download from R2: {key} - {e}")
            return None

    def upload_file(self, key: str, data: BinaryIO, content_type: str = 'application/octet-stream') -> bool:
        """Upload a file to R2"""
        if not self.client:
            logger.error("R2 client not initialized")
            return False

        try:
            self.client.put_object(
                Bucket=settings.r2_bucket_name,
                Key=key,
                Body=data,
                ContentType=content_type
            )
            logger.info(f"Uploaded file to R2: {key}")
            return True
        except Exception as e:
            logger.error(f"Failed to upload to R2: {key} - {e}")
            return False

    def delete_file(self, key: str) -> bool:
        """Delete a file from R2"""
        if not self.client:
            logger.error("R2 client not initialized")
            return False

        try:
            self.client.delete_object(
                Bucket=settings.r2_bucket_name,
                Key=key
            )
            logger.info(f"Deleted file from R2: {key}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete from R2: {key} - {e}")
            return False

    def generate_presigned_url(self, key: str, expires_in: int = 3600) -> Optional[str]:
        """Generate a presigned URL for downloading a file"""
        if not self.client:
            logger.error("R2 client not initialized")
            return None

        try:
            url = self.client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': settings.r2_bucket_name,
                    'Key': key
                },
                ExpiresIn=expires_in
            )
            return url
        except Exception as e:
            logger.error(f"Failed to generate presigned URL: {key} - {e}")
            return None

    def generate_presigned_upload_url(self, key: str, content_type: str = 'application/octet-stream', expires_in: int = 3600) -> Optional[str]:
        """Generate a presigned URL for uploading a file directly to R2"""
        if not self.client:
            logger.error("R2 client not initialized")
            return None

        try:
            # Don't include ContentType in signed headers to avoid signature mismatch
            url = self.client.generate_presigned_url(
                'put_object',
                Params={
                    'Bucket': settings.r2_bucket_name,
                    'Key': key
                },
                ExpiresIn=expires_in
            )
            return url
        except Exception as e:
            logger.error(f"Failed to generate presigned upload URL: {key} - {e}")
            return None


# Singleton instance
_r2_service: Optional[R2Service] = None


def get_r2_service() -> R2Service:
    """Get the R2 service singleton"""
    global _r2_service
    if _r2_service is None:
        _r2_service = R2Service()
    return _r2_service
