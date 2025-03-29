const { S3Client, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage'); // Utilitaire pour les uploads multipart
const { Readable } = require('stream');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

/**
 * Uploads a file stream or buffer to S3.
 * Handles multipart uploads automatically for large files.
 * @param {Readable | Buffer} fileData - The file stream or buffer.
 * @param {string} originalName - The original filename for deriving extension.
 * @param {string} mimeType - The MIME type of the file.
 * @returns {Promise<{key: string, location: string}>} - The S3 key and location URL.
 */
const uploadToS3 = async (fileData, originalName, mimeType) => {
    const fileExtension = path.extname(originalName);
    const uniqueKey = `uploads/${uuidv4()}${fileExtension}`; // Préfixe 'uploads/' pour organisation

    try {
        const parallelUploads3 = new Upload({
            client: s3Client,
            params: {
                Bucket: BUCKET_NAME,
                Key: uniqueKey,
                Body: fileData, // Accepte Stream ou Buffer
                ContentType: mimeType,
                // ACL: 'private', // Ou 'public-read' si besoin (moins sécurisé)
            },
            // Options pour l'upload multipart (taille des chunks, concurrence)
            // queueSize: 4, // Nombre de chunks à uploader en parallèle
            // partSize: 1024 * 1024 * 5, // Taille de chaque chunk (min 5MB)
            // leavePartsOnError: false, // Supprimer les chunks si erreur
        });

        parallelUploads3.on('httpUploadProgress', (progress) => {
            // console.log('S3 Upload Progress:', progress); // Peut être utilisé pour logs serveur
        });

        const result = await parallelUploads3.done();
        console.log(`File uploaded successfully to S3: ${result.Key}`);
        return { key: result.Key, location: result.Location };

    } catch (error) {
        console.error(`Error uploading file ${originalName} to S3:`, error);
        throw new Error(`S3 Upload failed for ${originalName}`); // Renvoyer une erreur claire
    }
};

/**
 * Gets a readable stream for an object from S3.
 * @param {string} s3Key - The key of the object in S3.
 * @returns {Promise<Readable>} - A readable stream of the S3 object body.
 */
const getS3ReadStream = async (s3Key) => {
    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
    });

    try {
        const { Body } = await s3Client.send(command);
        if (!Body || !(Body instanceof Readable)) {
             throw new Error('S3 GetObject did not return a readable stream.');
        }
        return Body; // Body est déjà un Readable Stream avec SDK v3
    } catch (error) {
        console.error(`Error getting S3 object stream for key ${s3Key}:`, error);
        if (error.name === 'NoSuchKey') {
            throw new Error('File not found in storage.'); // Erreur plus spécifique
        }
        throw new Error('Could not retrieve file from storage.');
    }
};

/**
 * Deletes a single object from S3.
 * @param {string} s3Key - The key of the object to delete.
 */
const deleteS3Object = async (s3Key) => {
    const command = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
    });

    try {
        await s3Client.send(command);
        console.log(`Successfully deleted S3 object: ${s3Key}`);
    } catch (error) {
        console.error(`Error deleting S3 object ${s3Key}:`, error);
        // Ne pas rejeter forcément l'erreur ici si c'est pour du cleanup 'best effort'
    }
};

/**
 * Deletes multiple objects from S3.
 * @param {string[]} s3Keys - An array of S3 keys to delete.
 */
const deleteS3Objects = async (s3Keys) => {
    if (!s3Keys || s3Keys.length === 0) return;

    const deleteParams = {
        Bucket: BUCKET_NAME,
        Delete: {
            Objects: s3Keys.map(key => ({ Key: key })),
            Quiet: false, // Pour avoir les résultats de suppression
        },
    };
    const command = new DeleteObjectsCommand(deleteParams);

    try {
        const { Deleted, Errors } = await s3Client.send(command);
        if (Deleted && Deleted.length > 0) {
             console.log(`Successfully deleted ${Deleted.length} S3 objects.`);
        }
        if (Errors && Errors.length > 0) {
            console.error(`Errors deleting ${Errors.length} S3 objects:`, Errors);
        }
    } catch (error) {
        console.error('Error during bulk S3 object deletion:', error);
    }
};


module.exports = {
    uploadToS3,
    getS3ReadStream,
    deleteS3Object,
    deleteS3Objects,
};