// --- Configuration (pourrait venir d'une API config plus tard) ---
const API_BASE_URL = 'http://localhost:5000'; // URL du backend
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '1000'); // Doit correspondre au backend .env
const MAX_TOTAL_SIZE_MB = parseInt(process.env.MAX_TOTAL_SIZE_MB || '2000');
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_TOTAL_SIZE_BYTES = MAX_TOTAL_SIZE_MB * 1024 * 1024;


// --- DOM Elements ---
const uploadBox = document.getElementById('upload-box');
const uploadForm = document.getElementById('upload-form');
const fileInput = document.getElementById('file-input');
const selectButton = document.getElementById('select-button');
const dropZone = document.getElementById('drop-zone');
const filePreviewArea = document.getElementById('file-preview-area');
const fileList = document.getElementById('file-list');
const fileCountSpan = document.getElementById('file-count');
const totalSizeSpan = document.getElementById('total-size');
const limitInfoSpan = document.getElementById('limit-info');
const uploadButton = document.getElementById('upload-button');
const uploadButtonText = uploadButton.querySelector('.btn-text');
const uploadSpinner = uploadButton.querySelector('.spinner');

const progressArea = document.getElementById('progress-area');
const progressBar = document.getElementById('progress-bar');
const progressPercentage = document.getElementById('progress-percentage');
const uploadStatus = document.getElementById('upload-status');

const resultArea = document.getElementById('result-area');
const linkInput = document.getElementById('link-input');
const copyButton = document.getElementById('copy-button');
const copyButtonText = copyButton.querySelector('.copy-text');
const expirationInfo = document.getElementById('expiration-info');
const transferAgainButton = document.getElementById('transfer-again-button');

const errorArea = document.getElementById('error-area');
const errorMessage = document.getElementById('error-message');
const retryButton = document.getElementById('retry-button');

const currentYearSpan = document.getElementById('current-year');


// --- State ---
let filesToUpload = []; // Tableau des objets File
let currentXhr = null; // Pour pouvoir annuler l'upload en cours

// --- Initial Setup ---
const initializeApp = () => {
    if (currentYearSpan) {
        currentYearSpan.textContent = new Date().getFullYear();
    }
    limitInfoSpan.textContent = `Max ${MAX_TOTAL_SIZE_MB} GB au total`; // Afficher la limite
    addEventListeners();
    resetUI(); // Assurer l'état initial
};

// --- Event Listeners ---
const addEventListeners = () => {
    selectButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelection);

    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);
    dropZone.addEventListener('click', () => fileInput.click()); // Cliquer sur la zone déclenche aussi l'input

    uploadForm.addEventListener('submit', handleUploadSubmit);

    fileList.addEventListener('click', handleRemoveFile); // Délégation d'événement

    copyButton.addEventListener('click', handleCopyLink);
    transferAgainButton.addEventListener('click', resetUI);
    retryButton.addEventListener('click', () => {
        // Si on veut réessayer avec les mêmes fichiers :
        if (filesToUpload.length > 0) {
            handleUploadSubmit(new Event('submit')); // Simuler un nouvel envoi
        } else {
            resetUI(); // Sinon, revenir à l'état initial
        }
    });
};

// --- UI Update Functions ---
const updateFileListUI = () => {
    fileList.innerHTML = ''; // Clear list
    let currentTotalSize = 0;
    let fileCount = 0;

    filesToUpload.forEach((fileWrapper, index) => {
        const file = fileWrapper.file;
        const li = document.createElement('li');
        li.dataset.index = index; // Stocker l'index pour la suppression

        const nameSpan = document.createElement('span');
        nameSpan.className = 'file-name';
        nameSpan.textContent = file.name;

        const sizeSpan = document.createElement('span');
        sizeSpan.className = 'file-size';
        sizeSpan.textContent = formatBytes(file.size);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button'; // Important pour ne pas soumettre le formulaire
        removeBtn.className = 'remove-file-btn';
        removeBtn.innerHTML = '×'; // Icône de croix
        removeBtn.setAttribute('aria-label', `Supprimer ${file.name}`);
        removeBtn.dataset.action = 'remove'; // Pour la délégation

        li.appendChild(nameSpan);
        li.appendChild(sizeSpan);
        li.appendChild(removeBtn);
        fileList.appendChild(li);

        currentTotalSize += file.size;
        fileCount++;
    });

    fileCountSpan.textContent = `${fileCount} fichier(s)`;
    totalSizeSpan.textContent = formatBytes(currentTotalSize);

    // Afficher/Cacher la zone de prévisualisation
    filePreviewArea.style.display = filesToUpload.length > 0 ? 'block' : 'none';

    // Activer/Désactiver le bouton d'upload
    uploadButton.disabled = filesToUpload.length === 0 || currentTotalSize > MAX_TOTAL_SIZE_BYTES;

     // Afficher une erreur si la taille totale est dépassée
    if (currentTotalSize > MAX_TOTAL_SIZE_BYTES) {
         limitInfoSpan.style.color = 'var(--danger-color)';
         limitInfoSpan.textContent = `Taille totale dépassée (Max ${formatBytes(MAX_TOTAL_SIZE_BYTES)})`;
    } else {
         limitInfoSpan.style.color = 'var(--secondary-color)';
         limitInfoSpan.textContent = `Max ${formatBytes(MAX_TOTAL_SIZE_BYTES)} au total`;
    }
};

const showProgressUI = () => {
    uploadBox.style.display = 'none';
    resultArea.style.display = 'none';
    errorArea.style.display = 'none';
    progressArea.style.display = 'block';
    progressBar.style.width = '0%';
    progressBar.setAttribute('aria-valuenow', '0');
    progressPercentage.textContent = '0%';
    uploadStatus.textContent = 'Préparation de l\'upload...';
};

const updateProgressUI = (percentage, loaded, total) => {
    const percent = Math.round(percentage);
    progressBar.style.width = `${percent}%`;
    progressBar.setAttribute('aria-valuenow', percent);
    progressPercentage.textContent = `${percent}%`;
    if (total) {
        uploadStatus.textContent = `Upload de ${formatBytes(loaded)} sur ${formatBytes(total)}`;
    } else {
        uploadStatus.textContent = `Upload en cours... ${percent}%`;
    }
};

const showResultUI = (data) => {
    uploadBox.style.display = 'none';
    progressArea.style.display = 'none';
    errorArea.style.display = 'none';
    resultArea.style.display = 'block';

    linkInput.value = data.downloadLink;
    copyButtonText.textContent = 'Copier'; // Reset copy button text
    copyButton.disabled = false;

    const expiryDate = new Date(data.expiresAt);
    expirationInfo.textContent = `Le lien expirera le ${expiryDate.toLocaleDateString('fr-FR')} à ${expiryDate.toLocaleTimeString('fr-FR')}.`;
};

const showErrorUI = (message) => {
    uploadBox.style.display = 'none';
    progressArea.style.display = 'none';
    resultArea.style.display = 'none';
    errorArea.style.display = 'block';
    errorMessage.textContent = message || 'Une erreur inconnue est survenue.';
};

const resetUI = () => {
    filesToUpload = [];
    currentXhr = null;
    updateFileListUI();

    uploadBox.style.display = 'block';
    progressArea.style.display = 'none';
    resultArea.style.display = 'none';
    errorArea.style.display = 'none';

    fileInput.value = ''; // Important pour pouvoir resélectionner le même fichier
    uploadButton.disabled = true;
    uploadButtonText.textContent = 'Transférer';
    uploadSpinner.style.display = 'none';

    progressBar.style.width = '0%';
    progressBar.setAttribute('aria-valuenow', '0');
    progressPercentage.textContent = '0%';
};

// --- File Handling Logic ---
const handleFileSelection = (event) => {
    const selectedFiles = event.target.files;
    addFiles(selectedFiles);
};

const handleDragOver = (event) => {
    event.preventDefault(); // Nécessaire pour permettre le drop
    event.stopPropagation();
    uploadBox.classList.add('dragover');
};

const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();
    uploadBox.classList.remove('dragover');
};

const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    uploadBox.classList.remove('dragover');
    const droppedFiles = event.dataTransfer.files;
    addFiles(droppedFiles);
};

const addFiles = (newFiles) => {
    let currentTotalSize = filesToUpload.reduce((sum, fw) => sum + fw.file.size, 0);

    for (const file of newFiles) {
        // Validation basique côté client (la validation serveur est la plus importante)
        if (file.size > MAX_FILE_SIZE_BYTES) {
            alert(`Le fichier "${file.name}" (${formatBytes(file.size)}) dépasse la taille maximale autorisée par fichier (${formatBytes(MAX_FILE_SIZE_BYTES)}).`);
            continue; // Ignorer ce fichier
        }
        if (currentTotalSize + file.size > MAX_TOTAL_SIZE_BYTES) {
             alert(`L'ajout du fichier "${file.name}" dépasserait la taille totale autorisée (${formatBytes(MAX_TOTAL_SIZE_BYTES)}).`);
             // On pourrait arrêter d'ajouter d'autres fichiers ici
             break;
        }

        // Vérifier si le fichier (par nom et taille) est déjà dans la liste
        const isDuplicate = filesToUpload.some(fw => fw.file.name === file.name && fw.file.size === file.size);
        if (!isDuplicate) {
            filesToUpload.push({ file: file, id: generateUniqueId() }); // Ajouter un ID unique
             currentTotalSize += file.size;
        } else {
             console.log(`Fichier dupliqué ignoré: ${file.name}`);
        }
    }
    updateFileListUI();
};

const handleRemoveFile = (event) => {
    // Vérifier si le clic vient bien du bouton supprimer
    if (event.target.dataset.action === 'remove') {
        const li = event.target.closest('li'); // Trouver l'élément li parent
        if (li && li.dataset.index) {
            const indexToRemove = parseInt(li.dataset.index, 10);
            filesToUpload.splice(indexToRemove, 1); // Supprimer du tableau
            updateFileListUI(); // Mettre à jour l'UI
        }
    }
};

// --- Upload Logic ---
const handleUploadSubmit = (event) => {
    event.preventDefault(); // Empêcher la soumission standard du formulaire
    if (filesToUpload.length === 0 || uploadButton.disabled) {
        return;
    }

    showProgressUI();
    setUploadButtonState(true); // État "loading"

    const formData = new FormData();
    filesToUpload.forEach(fileWrapper => {
        formData.append('files', fileWrapper.file); // 'files' doit correspondre au nom attendu par Multer
    });

    // Utiliser XMLHttpRequest pour la progression de l'upload
    currentXhr = new XMLHttpRequest();

    currentXhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            const percentage = (e.loaded / e.total) * 100;
            updateProgressUI(percentage, e.loaded, e.total);
        } else {
             // Afficher une progression indéterminée si la taille n'est pas connue
             // Pourrait arriver dans certains scénarios de streaming complexes
             updateProgressUI(0); // Ou un état visuel différent
             uploadStatus.textContent = 'Upload en cours...';
        }
    });

    currentXhr.addEventListener('load', () => {
        setUploadButtonState(false); // Fin du loading
        if (currentXhr.status >= 200 && currentXhr.status < 300) {
            try {
                const responseData = JSON.parse(currentXhr.responseText);
                if (responseData.success) {
                    showResultUI(responseData);
                    filesToUpload = []; // Vider la liste après succès
                } else {
                    throw new Error(responseData.message || 'Réponse invalide du serveur.');
                }
            } catch (parseError) {
                console.error('Error parsing server response:', parseError);
                showErrorUI('Erreur de communication avec le serveur.');
            }
        } else {
             handleUploadError(currentXhr.status, currentXhr.responseText);
        }
    });

    currentXhr.addEventListener('error', () => {
        setUploadButtonState(false);
        console.error('Upload network error');
        showErrorUI('Erreur réseau lors de l\'upload. Vérifiez votre connexion.');
        currentXhr = null; // Réinitialiser XHR
    });

    currentXhr.addEventListener('abort', () => {
        setUploadButtonState(false);
        console.log('Upload aborted by user.');
        resetUI(); // Ou un message spécifique "Upload annulé"
        currentXhr = null;
    });

    currentXhr.open('POST', `${API_BASE_URL}/api/upload`);
    // Ajouter des en-têtes si nécessaire (ex: authentification JWT)
    // xhr.setRequestHeader('Authorization', 'Bearer VOTRE_TOKEN');
    currentXhr.send(formData);
};

const handleUploadError = (status, responseText) => {
     let errorMessageText = `Erreur serveur (${status}).`;
     try {
         const errorData = JSON.parse(responseText);
         // Utiliser le message d'erreur fourni par le backend s'il existe
         if (errorData && errorData.error && errorData.error.message) {
             errorMessageText = errorData.error.message;
         } else if (errorData && errorData.message) { // Compatibilité avec d'autres formats d'erreur
              errorMessageText = errorData.message;
         }
     } catch (e) {
         console.warn('Could not parse error response:', responseText);
         // Garder le message d'erreur générique si le JSON est invalide
     }
     showErrorUI(errorMessageText);
     currentXhr = null; // Réinitialiser XHR
}

const setUploadButtonState = (isLoading) => {
    if (isLoading) {
        uploadButton.disabled = true;
        uploadButtonText.textContent = 'Envoi...';
        uploadSpinner.style.display = 'inline-block';
    } else {
        // Le bouton sera réactivé/désactivé par updateFileListUI si nécessaire
        uploadButton.disabled = filesToUpload.length === 0;
        uploadButtonText.textContent = 'Transférer';
        uploadSpinner.style.display = 'none';
    }
};

// --- Utility Functions ---
const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const generateUniqueId = () => {
    // Générateur simple d'ID pour les éléments de la liste (pas cryptographiquement sûr)
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

const handleCopyLink = async () => {
    try {
        await navigator.clipboard.writeText(linkInput.value);
        copyButtonText.textContent = 'Copié !';
        copyButton.disabled = true; // Désactiver temporairement
        setTimeout(() => {
            copyButtonText.textContent = 'Copier';
            copyButton.disabled = false;
        }, 2000); // Revenir à l'état initial après 2 secondes
    } catch (err) {
        console.error('Failed to copy link: ', err);
        // Fallback pour anciens navigateurs (moins fiable)
        try {
            linkInput.select();
            document.execCommand('copy');
             copyButtonText.textContent = 'Copié !';
             copyButton.disabled = true;
             setTimeout(() => {
                 copyButtonText.textContent = 'Copier';
                 copyButton.disabled = false;
             }, 2000);
        } catch (execErr) {
             alert('La copie automatique a échoué. Veuillez copier le lien manuellement.');
        }
    }
};

// --- Start the app ---
document.addEventListener('DOMContentLoaded', initializeApp);