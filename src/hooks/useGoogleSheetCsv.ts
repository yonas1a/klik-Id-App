import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';

export interface Employee {
  Name: string;
  Role: string;
  ID?: string;
  id?: string;
  Subcity: string;
  Phone: string;
  Photo: string;
}

export function useGoogleSheetCsv(url: string) {
  const [data, setData] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    
    setLoading(true);
    setError(null);

    Papa.parse<Employee>(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setLoading(false);
        if (results.errors.length > 0) {
          console.error("PapaParse errors:", results.errors);
        }
        setData(results.data as Employee[]);
      },
      error: (err: any) => {
        setLoading(false);
        setError(err.message || 'Failed to parse CSV');
      }
    });

  }, [url]);

  return { data, loading, error };
}
