const mongoose = require('mongoose');

const FileSchema = new mongoose.Schema({
  originalName: { type: String, required: true },
  s3Key: { type: String, required: true }, // Clé unique de l'objet dans S3
  size: { type: Number, required: true },
  mimeType: { type: String, required: true },
}, { _id: false }); // Pas besoin d'un _id séparé pour les sous-documents de fichier

const TransferSchema = new mongoose.Schema({
  transferId: {
    type: String,
    required: true,
    unique: true,
    index: true, // Index pour recherche rapide
  },
  files: [FileSchema],
  totalSize: {
    type: Number,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true, // Index pour la tâche de nettoyage
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  downloadCount: {
    type: Number,
    default: 0,
  },
  // Optionnel: Ajouter un champ pour l'ID utilisateur si authentification
  // userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

// Middleware pour calculer la taille totale avant de sauvegarder
TransferSchema.pre('save', function (next) {
  if (this.isNew || this.isModified('files')) {
    this.totalSize = this.files.reduce((sum, file) => sum + file.size, 0);
  }
  next();
});

module.exports = mongoose.model('Transfer', TransferSchema);