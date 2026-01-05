import fs from 'fs';
import { PDFDocument, rgb, PDFPage } from 'pdf-lib';
import { TextField, Signature } from '../types';

export async function signPDF(
  originalPdfPath: string,
  outputPdfPath: string,
  textFields: TextField[],
  signatures: Signature[]
): Promise<void> {
  try {
    // Load the original PDF
    const existingPdfBytes = fs.readFileSync(originalPdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    
    const pages = pdfDoc.getPages();
    
    // Add text fields
    for (const textField of textFields) {
      if (textField.page_number > 0 && textField.page_number <= pages.length) {
        const page = pages[textField.page_number - 1];
        const { width: pageWidth, height: pageHeight } = page.getSize();
        
        // Convert coordinates (assuming frontend uses pixel coordinates)
        // PDF coordinates start from bottom-left, so we need to convert
        const x = textField.x_coordinate;
        const y = pageHeight - textField.y_coordinate - textField.height;
        
        page.drawText(textField.text_content, {
          x: x,
          y: y,
          size: textField.font_size,
          color: rgb(0, 0, 0),
        });
      }
    }
    
    // Add signatures
    for (const signature of signatures) {
      if (signature.page_number > 0 && signature.page_number <= pages.length) {
        const page = pages[signature.page_number - 1];
        const { width: pageWidth, height: pageHeight } = page.getSize();
        
        // Load signature image
        const signatureImageBytes = fs.readFileSync(signature.signature_image_path);
        let signatureImage;
        
        try {
          signatureImage = await pdfDoc.embedPng(signatureImageBytes);
        } catch {
          signatureImage = await pdfDoc.embedJpg(signatureImageBytes);
        }
        
        // Convert coordinates
        const x = signature.x_coordinate;
        const y = pageHeight - signature.y_coordinate - signature.height;
        
        page.drawImage(signatureImage, {
          x: x,
          y: y,
          width: signature.width,
          height: signature.height,
        });
      }
    }
    
    // Flatten the PDF (make it non-editable)
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPdfPath, pdfBytes);
    
    console.log(`✅ PDF signed and saved: ${outputPdfPath}`);
  } catch (error) {
    console.error('❌ PDF signing failed:', error);
    throw new Error('Failed to sign PDF');
  }
}

