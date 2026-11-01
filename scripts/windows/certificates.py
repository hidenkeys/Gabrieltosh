"""Create a private store CA and a server certificate, preserving the CA on repair."""
import sys
import ipaddress
from pathlib import Path
from datetime import datetime, timedelta, timezone
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID

folder, address, hostname = sys.argv[1:]
ip = ipaddress.IPv4Address(address)
if not ip.is_private or ip.is_loopback or ip.is_unspecified or ip.is_multicast:
    raise ValueError("Choose the Windows computer's private LAN IPv4 address.")
path = Path(folder)
path.mkdir(parents=True, exist_ok=True)
now = datetime.now(timezone.utc)

def save_key(key, filename):
    filename.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))

if (path / "ca-key.pem").exists():
    ca_key = serialization.load_pem_private_key((path / "ca-key.pem").read_bytes(), password=None)
    ca = x509.load_pem_x509_certificate((path / "ca.pem").read_bytes())
else:
    ca_key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Bing Chun Surulere Store CA")])
    ca = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(ca_key.public_key())
          .serial_number(x509.random_serial_number()).not_valid_before(now - timedelta(minutes=5))
          .not_valid_after(now + timedelta(days=3650)).add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
          .add_extension(x509.KeyUsage(digital_signature=True, key_encipherment=False, content_commitment=False,
              data_encipherment=False, key_agreement=False, key_cert_sign=True, crl_sign=True,
              encipher_only=False, decipher_only=False), critical=True).sign(ca_key, hashes.SHA256()))
    save_key(ca_key, path / "ca-key.pem")
    (path / "ca.pem").write_bytes(ca.public_bytes(serialization.Encoding.PEM))

key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
names = [x509.IPAddress(ip), x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")), x509.DNSName("localhost"), x509.DNSName(hostname)]
cert = (x509.CertificateBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Bing Chun Store")]))
        .issuer_name(ca.subject).public_key(key.public_key()).serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=5)).not_valid_after(now + timedelta(days=365))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.SubjectAlternativeName(names), critical=False)
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
        .sign(ca_key, hashes.SHA256()))
save_key(key, path / "store-key.pem")
(path / "store.pem").write_bytes(cert.public_bytes(serialization.Encoding.PEM))
(path / "Store-Tablet-CA.cer").write_bytes(ca.public_bytes(serialization.Encoding.DER))
print("Store certificate ready. Install Store-Tablet-CA.cer as a CA certificate on managed tablets.")
