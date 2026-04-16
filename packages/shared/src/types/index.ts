export interface Student {
    id: string;
    name: string;
    age: number;
    gender: 'male' | 'female' | 'other';
    roomId: string;
    contactNumber: string;
    email: string;
    admissionDate: Date;
}

export interface Room {
    id: string;
    roomNumber: string;
    capacity: number;
    currentOccupancy: number;
    amenities: string[];
}

export interface Payment {
    id: string;
    studentId: string;
    amount: number;
    paymentDate: Date;
    paymentMethod: 'cash' | 'credit_card' | 'debit_card' | 'online';
}

export interface Complaint {
    id: string;
    studentId: string;
    complaintText: string;
    status: 'pending' | 'resolved' | 'closed';
    createdAt: Date;
    updatedAt: Date;
}