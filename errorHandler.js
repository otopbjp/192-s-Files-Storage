const errorHandler = (err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Erreur Interne du Serveur';
  
    console.error('ERROR STACK:', err.stack); // Log complet pour le debug en dev
  
    // Erreurs spécifiques (ex: Mongoose validation, CastError)
    if (err.name === 'ValidationError') {
      message = Object.values(err.errors).map(val => val.message).join(', ');
      statusCode = 400; // Bad Request
    }
    if (err.name === 'CastError') {
      message = `Ressource non trouvée avec l'ID ${err.value}`;
      statusCode = 404; // Not Found
    }
    // Erreur de duplication de clé MongoDB
    if (err.code === 11000) {
        message = 'Une ressource avec cette valeur existe déjà.';
        statusCode = 409; // Conflict
    }
    // Erreur Multer (ex: fichier trop gros)
    if (err instanceof require('multer').MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            message = `Le fichier dépasse la taille maximale autorisée (${process.env.MAX_FILE_SIZE_MB} MB).`;
            statusCode = 413; // Payload Too Large
        } else {
            message = err.message;
            statusCode = 400;
        }
    }
  
  
    // Réponse d'erreur JSON standardisée
    res.status(statusCode).json({
      success: false,
      error: {
        message: message,
        // Ne pas exposer le stack trace en production
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
      },
    });
  };
  
  module.exports = errorHandler;