"""Exercise the actual certificate tool, including identity preservation on repair."""
import ipaddress
import subprocess
import sys
import tempfile
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.primitives import hashes

script = Path(__file__).resolve().parents[2] / "scripts/windows/certificates.py"
with tempfile.TemporaryDirectory() as directory:
    folder = Path(directory)
    def generate(address):
        return subprocess.run([sys.executable, str(script), directory, address, "STORE-PC"], capture_output=True)
    result = generate("192.168.1.20")
    assert result.returncode == 0, result.stderr.decode()
    ca = x509.load_pem_x509_certificate((folder / "ca.pem").read_bytes())
    leaf = x509.load_pem_x509_certificate((folder / "store.pem").read_bytes())
    names = leaf.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    assert ipaddress.IPv4Address("192.168.1.20") in names.get_values_for_type(x509.IPAddress)
    assert "localhost" in names.get_values_for_type(x509.DNSName)
    assert leaf.issuer == ca.subject
    original_key = (folder / "ca-key.pem").read_bytes()
    assert generate("192.168.1.21").returncode == 0
    renewed_ca = x509.load_pem_x509_certificate((folder / "ca.pem").read_bytes())
    assert renewed_ca.fingerprint(hashes.SHA256()) == ca.fingerprint(hashes.SHA256())
    assert (folder / "ca-key.pem").read_bytes() == original_key
    assert generate("8.8.8.8").returncode != 0
    assert generate("127.0.0.1").returncode != 0
print("Certificate SANs, CA preservation and invalid address checks passed.")
