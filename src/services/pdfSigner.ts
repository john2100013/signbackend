import fs from 'fs';
import path from 'path';
import { PDFDocument, rgb, PDFPage } from 'pdf-lib';
import { TextField, Signature } from '../types';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

export async function signPDF(
  originalPdfPath: string,
  outputPdfPath: string,
  textFields: TextField[],
  signatures: Signature[]
): Promise<void> {
  try {
    // Resolve original PDF path
    const backendRoot = path.resolve(__dirname, '..', '..');
    const resolvedOriginalPath = path.isAbsolute(originalPdfPath)
      ? originalPdfPath
      : path.resolve(backendRoot, originalPdfPath);
    
    console.log(`📄 Loading original PDF from: ${resolvedOriginalPath}`);
    
    if (!fs.existsSync(resolvedOriginalPath)) {
      throw new Error(`Original PDF not found: ${resolvedOriginalPath}`);
    }
    
    // Load the original PDF
    const existingPdfBytes = fs.readFileSync(resolvedOriginalPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    
    const pages = pdfDoc.getPages();
    
    // Add text fields
    for (const textField of textFields) {
      if (textField.page_number > 0 && textField.page_number <= pages.length) {
        const page = pages[textField.page_number - 1];
        const { width: pageWidth, height: pageHeight } = page.getSize();
        
        // Convert all numeric values to numbers (they might come as strings from DB/API)
        const x = Number(textField.x_coordinate);
        const y = pageHeight - Number(textField.y_coordinate) - Number(textField.height);
        const fontSize = Number(textField.font_size);
        
        // Validate numeric values
        if (isNaN(x) || isNaN(y) || isNaN(fontSize)) {
          console.error('❌ Invalid numeric values in text field:', {
            x: textField.x_coordinate,
            y: textField.y_coordinate,
            height: textField.height,
            font_size: textField.font_size,
          });
          throw new Error(`Invalid numeric values in text field: x=${textField.x_coordinate}, y=${textField.y_coordinate}, font_size=${textField.font_size}`);
        }
        
        console.log(`📝 Drawing text "${textField.text_content}" at (${x}, ${y}) with font size ${fontSize}`);
        
        page.drawText(textField.text_content, {
          x: x,
          y: y,
          size: fontSize,
          color: rgb(0, 0, 0),
        });
      }
    }
    
    // Add signatures
    for (const signature of signatures) {
      if (signature.page_number > 0 && signature.page_number <= pages.length) {
        const page = pages[signature.page_number - 1];
        const { width: pageWidth, height: pageHeight } = page.getSize();
        
        // Resolve signature image path
        const signaturePath = signature.signature_image_path;
        const resolvedSignaturePath = path.isAbsolute(signaturePath)
          ? signaturePath
          : path.resolve(backendRoot, signaturePath);
        
        console.log(`🖊️ Loading signature from: ${resolvedSignaturePath}`);
        
        if (!fs.existsSync(resolvedSignaturePath)) {
          console.error(`❌ Signature image not found: ${resolvedSignaturePath}`);
          throw new Error(`Signature image not found: ${signaturePath}`);
        }
        
        // Load signature image
        const signatureImageBytes = fs.readFileSync(resolvedSignaturePath);
        let signatureImage;
        
        try {
          signatureImage = await pdfDoc.embedPng(signatureImageBytes);
          console.log(`✅ Embedded signature as PNG`);
        } catch (pngError) {
          try {
            signatureImage = await pdfDoc.embedJpg(signatureImageBytes);
            console.log(`✅ Embedded signature as JPG`);
          } catch (jpgError) {
            console.error('❌ Failed to embed signature as PNG or JPG:', { pngError, jpgError });
            throw new Error(`Failed to embed signature image: ${signaturePath}`);
          }
        }
        
        // Convert all numeric values to numbers (they might come as strings from DB/API)
        const x = Number(signature.x_coordinate);
        const y = pageHeight - Number(signature.y_coordinate) - Number(signature.height);
        const width = Number(signature.width);
        const height = Number(signature.height);
        
        // Validate numeric values
        if (isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) {
          console.error('❌ Invalid numeric values in signature:', {
            x: signature.x_coordinate,
            y: signature.y_coordinate,
            width: signature.width,
            height: signature.height,
          });
          throw new Error(`Invalid numeric values in signature: x=${signature.x_coordinate}, y=${signature.y_coordinate}, width=${signature.width}, height=${signature.height}`);
        }
        
        page.drawImage(signatureImage, {
          x: x,
          y: y,
          width: width,
          height: height,
        });
        
        console.log(`✅ Signature drawn at (${x}, ${y}) with size ${signature.width}x${signature.height}`);
      }
    }
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPdfPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`📁 Created output directory: ${outputDir}`);
    }
    
    // Resolve output path
    const resolvedOutputPath = path.isAbsolute(outputPdfPath)
      ? outputPdfPath
      : path.resolve(backendRoot, outputPdfPath);
    
    // Flatten the PDF (make it non-editable)
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(resolvedOutputPath, pdfBytes);
    
    console.log(`✅ PDF signed and saved: ${resolvedOutputPath}`);
  } catch (error: any) {
    console.error('❌ PDF signing failed:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      originalPdfPath,
      outputPdfPath,
      textFieldsCount: textFields.length,
      signaturesCount: signatures.length,
    });
    throw new Error(`Failed to sign PDF: ${error.message}`);
  }
}


