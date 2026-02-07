import { useParams } from 'react-router-dom';

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold">Incident Detail: {id}</h1>
    </div>
  );
}
