require('dotenv').config(); // Charger les variables d'environnement
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Connexion à la base de données
connectDB();

const app = express();

// Middleware
app.use(cors()); // Activer CORS pour toutes les origines (ajuster en prod)
app.use(express.json()); // Pour parser le JSON entrant
app.use(express.urlencoded({ extended: true })); // Pour parser les données de formulaire

// Routes API
app.use('/api/upload', require('./routes/upload'));
app.use('/download', require('./routes/download')); // Note: Pas '/api' pour un lien plus court

// Route de test
app.get('/', (req, res) => {
  res.send('File Transfer API Running');
});

// Gestionnaire d'erreurs central (DOIT être le dernier middleware)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () =>
  console.log(
    `Server running in ${process.env.NODE_ENV} mode on port ${PORT}`
  )
);

// Gestion des rejets de promesses non gérés
process.on('unhandledRejection', (err, promise) => {
  console.error(`Unhandled Rejection: ${err.message}`);
  // Fermer le serveur et quitter proprement
  server.close(() => process.exit(1));
});