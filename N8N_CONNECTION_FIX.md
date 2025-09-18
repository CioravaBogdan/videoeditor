# 🚨 N8N Connection Fix - ECONNREFUSED ::1:3030

## 🎯 **PROBLEMĂ IDENTIFICATĂ**
n8n încearcă să se conecteze la `localhost:3030` dar rulează într-un container Docker, unde `localhost` se referă la localhost-ul containerului, nu la host-ul mașinii.

## ✅ **SOLUȚIE RAPIDĂ**

### 1. **Schimbă URL-ul în n8n din:**
```
http://localhost:3030/upload
```

### 2. **În:**
```
http://host.docker.internal:3030/upload
```

## 🔧 **ALTERNATIVE DE BACKUP**

Dacă `host.docker.internal` nu funcționează, încercă:

### **IPv4 Explicit:**
```
http://127.0.0.1:3030/upload
```

### **IP Real al Mașinii:**
```
http://192.168.1.30:3030/upload
```

## 📋 **TESTE DE VERIFICARE**

Testează din PowerShell că endpoint-urile funcționează:

```powershell
# Test health
curl "http://host.docker.internal:3030/health"

# Test cu IP real
curl "http://192.168.1.30:3030/health"

# Test IPv4 explicit  
curl "http://127.0.0.1:3030/health"
```

## 🎯 **PENTRU TOATE ENDPOINT-URILE**

Aplică aceeași schimbare pentru toate URL-urile din n8n:

- **Upload**: `http://host.docker.internal:3030/upload`
- **Jobs**: `http://host.docker.internal:3030/jobs`
- **Metadata**: `http://host.docker.internal:3030/metadata/{{ $json.files[0].filename }}`
- **Download**: `http://host.docker.internal:3030/download/{{ $json.outputFilename }}`

## 🌐 **DUPĂ CLOUDFLARE TUNNEL**

După ce configurezi tunelul Cloudflare, vei putea folosi:
```
https://videoeditor.byinfant.com/upload
https://videoeditor.byinfant.com/metadata/{{ $json.files[0].filename }}
```

## ✅ **STATUS ACTUAL**

- ✅ API funcționează perfect pe toate IP-urile
- ✅ IPv4 și IPv6 suportate  
- ✅ Toate endpoint-urile testate și funcționale
- ⚠️ Doar problema de networking între n8n container și host
