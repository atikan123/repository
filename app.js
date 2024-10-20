const express = require('express');
const multer = require('multer');
const puppeteer = require('puppeteer');
const { PDFDocument } = require('pdf-lib');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // For serving HTML

// Function to extract text from PDF
async function extractTextFromPdf(pdfFilePath) {
    const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfFilePath));
    const text = await pdfDoc.getPages()
        .map(page => page.getTextContent())
        .then(contents => contents.map(content => content.items.map(item => item.str).join('')).join('\n'));
    return text;
}

// Function to extract images from PDF (not fully implemented here)
async function extractImagesFromPdf(pdfFilePath) {
    // Implement your image extraction logic here
    return []; // Placeholder for images
}

// Function to fetch content with Puppeteer
async function fetchContentWithPuppeteer(url) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    const content = await page.content();
    await browser.close();
    return content;
}

// OCR function for images
async function extractTextFromImage(imagePath) {
    const result = await Tesseract.recognize(imagePath, 'eng+tha');
    return result.data.text;
}

// Route for file upload
app.post('/upload', upload.fields([{ name: 'pdf' }, { name: 'images' }]), async (req, res) => {
    const { url } = req.body;
    const pdfFile = req.files['pdf'] ? req.files['pdf'][0] : null;
    const imageFiles = req.files['images'] || [];

    const tempDir = 'temp_files';
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }

    let docContent = '';

    if (url) {
        try {
            const htmlContent = await fetchContentWithPuppeteer(url);
            docContent += htmlContent; // Simplified for demonstration
        } catch (error) {
            console.error(`Error fetching URL: ${error}`);
        }
    }

    if (pdfFile) {
        try {
            const pdfText = await extractTextFromPdf(pdfFile.path);
            docContent += `\nExtracted Text from PDF:\n${pdfText}\n`;
            const pdfImages = await extractImagesFromPdf(pdfFile.path);
            // Handle extracted images if needed
        } catch (error) {
            console.error(`Error extracting text from PDF: ${error}`);
        }
    }

    for (const imageFile of imageFiles) {
        try {
            const imageText = await extractTextFromImage(imageFile.path);
            docContent += `\nExtracted Text from Image ${imageFile.originalname}:\n${imageText}\n`;
        } catch (error) {
            console.error(`Error processing image ${imageFile.originalname}: ${error}`);
        }
    }

    // Save the extracted content to a text file
    const outputFilePath = path.join(tempDir, 'output.txt');
    fs.writeFileSync(outputFilePath, docContent);

    // Create a zip file
    const zipFilePath = path.join(__dirname, 'download.zip');
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip');

    output.on('close', () => {
        res.download(zipFilePath, 'download.zip', () => {
            // Cleanup after sending
            fs.unlinkSync(zipFilePath);
            fs.rmdirSync(tempDir, { recursive: true });
        });
    });

    archive.pipe(output);
    archive.file(outputFilePath, { name: 'output.txt' });
    archive.finalize();
});

// Serve the HTML form
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
