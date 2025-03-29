const Transfer = require('../models/Transfer');
const { getS3ReadStream } = require('../services/s3Service');
const archiver = require('archiver');

// Fonction pour trouver et valider le transfert
const findAndValidateTransfer = async (transferId) => {
    if (!transferId || typeof transferId !== 'string' || transferId.length < 36) { // Validation basique UUID
         const error = new Error('ID de transfert invalide.');
         error.statusCode = 400;
         throw error;
    }

    const transfer = await Transfer.findOne({ transferId: transferId });

    if (!transfer) {
        const error = new Error('Transfert non trouvé.');
        error.statusCode = 404;
        throw error;
    }

    if (transfer.expiresAt && new Date() > transfer.expiresAt) {
        // Optionnel : Ajouter ici la logique pour supprimer le transfert expiré de la DB et les fichiers S3
        // await transfer.deleteOne(); // Ou marquer comme expiré
        // await deleteS3Objects(transfer.files.map(f => f.s3Key));
        const error = new Error('Ce transfert a expiré.');
        error.statusCode = 410; // Gone
        throw error;
    }
    return transfer;
};

// Contrôleur pour obtenir les informations du transfert
exports.getTransferInfo = async (req, res, next) => {
    try {
        const transferId = req.params.transferId;
        const transfer = await findAndValidateTransfer(transferId);

        // Ne renvoyer que les informations publiques nécessaires
        res.json({
            success: true,
            transferId: transfer.transferId,
            fileCount: transfer.files.length,
            totalSize: transfer.totalSize,
            expiresAt: transfer.expiresAt.toISOString(),
            files: transfer.files.map(f => ({
                name: f.originalName,
                size: f.size,
                type: f.mimeType
            }))
        });

    } catch (error) {
        next(error); // Passer au gestionnaire d'erreurs
    }
};


// Contrôleur pour télécharger les fichiers
exports.downloadFiles = async (req, res, next) => {
    let transfer; // Pour pouvoir y accéder dans le finally
    try {
        const transferId = req.params.transferId;
        transfer = await findAndValidateTransfer(transferId);

        if (transfer.files.length === 1) {
            // --- Téléchargement Fichier Unique ---
            const file = transfer.files[0];
            const s3Stream = await getS3ReadStream(file.s3Key);

            // Définir les en-têtes pour le téléchargement
            // Encoder le nom de fichier pour les caractères spéciaux
            const encodedFilename = encodeURIComponent(file.originalName);
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilename}`);
            res.setHeader('Content-Type', file.mimeType);
            res.setHeader('Content-Length', file.size); // Important pour la progression client

            // Gérer les erreurs du stream S3 pendant le transfert
            s3Stream.on('error', (streamError) => {
                 console.error('S3 stream error during download:', streamError);
                 // Il est souvent trop tard pour envoyer un statut d'erreur HTTP ici
                 // car les en-têtes sont peut-être déjà envoyés.
                 // On peut essayer de terminer la connexion.
                 if (!res.headersSent) {
                     res.status(500).send('Erreur lors de la lecture du fichier depuis le stockage.');
                 } else {
                     res.end(); // Terminer la connexion si possible
                 }
            });

            // Pipe le stream S3 vers la réponse HTTP
            s3Stream.pipe(res);

        } else {
            // --- Téléchargement Multiple (ZIP) ---
            const archiveName = `${transferId}.zip`;
            const encodedArchiveName = encodeURIComponent(archiveName);
            res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedArchiveName}`);
            res.setHeader('Content-Type', 'application/zip');
            // Content-Length est difficile/impossible à déterminer à l'avance pour un ZIP créé à la volée

            const archive = archiver('zip', {
                zlib: { level: 1 } // Compression rapide pour streaming (0=pas de compression, 9=max)
            });

            // Gérer les erreurs de l'archiveur
            archive.on('warning', (err) => {
                if (err.code === 'ENOENT') {
                    console.warn('Archiver warning:', err); // Fichier source non trouvé?
                } else {
                    console.error('Archiver error:', err);
                     if (!res.headersSent) {
                         next(err); // Tenter de passer à l'erreur handler si possible
                     }
                }
            });
            archive.on('error', (err) => {
                 console.error('Archiver fatal error:', err);
                  if (!res.headersSent) {
                      next(err);
                  } else {
                      res.end(); // Terminer si les headers sont envoyés
                  }
            });


            // Pipe la sortie de l'archive vers la réponse HTTP
            archive.pipe(res);

            // Ajouter chaque fichier à l'archive depuis S3
            for (const file of transfer.files) {
                try {
                    const s3Stream = await getS3ReadStream(file.s3Key);
                    // Ajouter le stream S3 à l'archive avec le nom original
                    archive.append(s3Stream, { name: file.originalName });
                     // Gérer l'erreur de stream individuel ici est complexe dans archiver,
                     // il vaut mieux se fier aux erreurs globales de l'archive.
                } catch (streamError) {
                     console.error(`Error streaming ${file.s3Key} for archive:`, streamError);
                     // Si un fichier manque, on pourrait décider d'arrêter l'archivage
                     // ou de continuer avec les autres fichiers. Ici, on logue et continue.
                     // Pour arrêter, il faudrait `archive.abort()` et gérer l'erreur.
                }
            }

            // Finaliser l'archive (cela écrit les dernières métadonnées ZIP)
            // La réponse se termine quand l'archive a fini d'être pipée.
            await archive.finalize();
        }

        // Incrémenter le compteur de téléchargements APRÈS le début du streaming/archivage
        // Utiliser findOneAndUpdate pour l'atomicité
         await Transfer.findOneAndUpdate(
             { transferId: transferId },
             { $inc: { downloadCount: 1 } },
             { new: false } // Pas besoin de retourner le doc mis à jour
         );

    } catch (error) {
        if (!res.headersSent) { // Ne passer à next que si on n'a pas commencé à envoyer de données
             next(error);
        } else {
            console.error("Error during download after headers sent:", error);
            // Log l'erreur, mais on ne peut plus changer la réponse HTTP
        }
    }
};