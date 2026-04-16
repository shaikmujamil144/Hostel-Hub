export const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0];
};

export const calculateAge = (birthDate: Date): number => {
    const ageDiff = Date.now() - birthDate.getTime();
    const ageDate = new Date(ageDiff);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
};

export const generateUniqueId = (): string => {
    return 'id-' + Math.random().toString(36).substr(2, 16);
};