const Transfer = require('../models/Transfer');
const { v4: uuidv4 } = require('uuid');
const { Readable } = require('stream');
const { uploadToS3, deleteS3Objects } = require('../services/s3Service');
const mongoose = require('mongoose');

exports.uploadFiles = async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    const error = new Error('Aucun fichier sélectionné.');
    error.statusCode = 400;
    return next(error);
  }

  const uploadedS3Keys = []; // Garder une trace des clés S3 pour cleanup en cas d'erreur
  const session = await mongoose.startSession(); // Utiliser une transaction DB pour la cohérence

  try {
    session.startTransaction();

    const filesMetadata = [];
    let totalSize = 0;

    // Uploader chaque fichier sur S3 en parallèle
    const uploadPromises = req.files.map(async (file) => {
      const fileStream = Readable.from(file.buffer); // Créer un stream depuis le buffer mémoire
      const { key } = await uploadToS3(fileStream, file.originalname, file.mimetype);
      uploadedS3Keys.push(key); // Ajouter à la liste pour cleanup potentiel
      filesMetadata.push({
        originalName: file.originalname,
        s3Key: key,
        size: file.size,
        mimeType: file.mimetype,
      });
      totalSize += file.size; // Calculer la taille totale côté serveur
    });

    await Promise.all(uploadPromises); // Attendre la fin de tous les uploads S3

    // Générer l'ID unique et la date d'expiration
    const transferId = uuidv4();
    const expirationDays = parseInt(process.env.DEFAULT_EXPIRATION_DAYS || '7', 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    // Créer l'entrée dans la base de données DANS la transaction
    const [newTransfer] = await Transfer.create([{ // create() dans une session attend un array
      transferId,
      files: filesMetadata,
      totalSize, // Utiliser la taille calculée ici
      expiresAt,
    }], { session });

    await session.commitTransaction(); // Valider la transaction

    // Construire le lien de téléchargement
    const downloadLink = `${process.env.BASE_URL}/download/${transferId}`;

    res.status(201).json({
      success: true,
      message: 'Fichiers transférés avec succès.',
      transferId: transferId,
      downloadLink: downloadLink,
      expiresAt: expiresAt.toISOString(),
    });

  } catch (error) {
    console.error('Upload Error:', error);
    await session.abortTransaction(); // Annuler la transaction DB

    // Tenter de nettoyer les fichiers déjà uploadés sur S3 si l'erreur survient après
    if (uploadedS3Keys.length > 0) {
      console.log(`Attempting to clean up ${uploadedS3Keys.length} S3 objects due to error...`);
      await deleteS3Objects(uploadedS3Keys);
    }

    // Passer l'erreur au gestionnaire central
    if (!error.statusCode) {
        error.statusCode = 500; // Erreur serveur par défaut
        error.message = 'Une erreur est survenue lors du traitement de votre demande.';
    }
    next(error);

  } finally {
    await session.endSession(); // Toujours fermer la session
  }
};