import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { PDFDocument } from 'pdf-lib';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

export async function convertWordToPDF(wordFilePath: string, outputPdfPath: string): Promise<void> {
  try {
    // Read Word document
    const result = await mammoth.convertToHtml({ path: wordFilePath });
    const html = result.value;
    
    // For now, we'll create a simple PDF from HTML
    // In production, you might want to use a library like puppeteer or pdfkit
    // For this implementation, we'll create a basic PDF with the text content
    
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // US Letter size
    
    // Extract text from HTML (basic extraction)
    const textContent = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
    const lines = textContent.split('\n').filter(line => line.trim());
    
    let y = 750;
    const fontSize = 12;
    const lineHeight = 15;
    
    for (const line of lines) {
      if (y < 50) {
        const newPage = pdfDoc.addPage([612, 792]);
        y = 750;
      }
      
      page.drawText(line.substring(0, 80), {
        x: 50,
        y: y,
        size: fontSize,
      });
      
      y -= lineHeight;
    }
    
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPdfPath, pdfBytes);
    
    console.log(`✅ Converted Word to PDF: ${outputPdfPath}`);
  } catch (error) {
    console.error('❌ Word to PDF conversion failed:', error);
    throw new Error('Failed to convert Word document to PDF');
  }
}

export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

export function isWordDocument(filename: string): boolean {
  const ext = getFileExtension(filename);
  return ext === 'doc' || ext === 'docx';
}

export function isPDF(filename: string): boolean {
  return getFileExtension(filename) === 'pdf';
}

