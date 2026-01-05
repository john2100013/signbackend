export interface User {
  id: number;
  email: string;
  full_name: string;
  role: 'management' | 'recipient';
  is_external: boolean;
  must_change_password: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Document {
  id: number;
  title: string;
  original_filename: string;
  original_file_path: string;
  signed_file_path?: string;
  file_type: 'pdf' | 'word';
  uploaded_by: number;
  status: 'draft' | 'pending' | 'signed' | 'completed';
  created_at: Date;
  updated_at: Date;
}

export interface DocumentRecipient {
  id: number;
  document_id: number;
  recipient_id: number;
  status: 'pending' | 'draft' | 'signed';
  due_date?: Date;
  signed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface TextField {
  id?: number;
  document_id: number;
  recipient_id: number;
  page_number: number;
  x_coordinate: number;
  y_coordinate: number;
  width: number;
  height: number;
  font_size: number;
  text_content: string;
  is_draft: boolean;
}

export interface Signature {
  id?: number;
  document_id: number;
  recipient_id: number;
  page_number: number;
  x_coordinate: number;
  y_coordinate: number;
  width: number;
  height: number;
  signature_image_path: string;
  is_draft: boolean;
}

export interface DraftData {
  textFields: TextField[];
  signatures: Signature[];
}

export interface JwtPayload {
  userId: number;
  email: string;
  role: string;
}

