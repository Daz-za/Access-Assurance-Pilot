import * as Minio from 'minio';

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
});

export const storage = {
  async uploadEvidence(bucket: string, objectName: string, filePath: string) {
    await minioClient.fPutObject(bucket, objectName, filePath);
    return `http://${process.env.MINIO_ENDPOINT}:9000/${bucket}/${objectName}`;
  },

  async getEvidence(bucket: string, objectName: string) {
    return minioClient.getObject(bucket, objectName);
  },
};