import { useNavigate } from 'react-router-dom';

function Tile({ label, onClick }) {
  return (
    <button className="tile" onClick={onClick}>
      <span className="tile-icon">+</span>
      <span className="tile-label">{label}</span>
    </button>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <div className="tiles">
      <Tile label="Create League" onClick={() => navigate('/leagues/new')} />
      <Tile label="Upcoming League" onClick={() => navigate('/leagues/upcoming')} />
      <Tile label="Past League" onClick={() => navigate('/leagues/past')} />
    </div>
  );
}
