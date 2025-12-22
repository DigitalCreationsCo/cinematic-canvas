# Security Guide - LTX Video Generation API

## 🛡️ Security Features Overview

This deployment includes multiple layers of security:

1. **Cloud Armor** - DDoS protection and WAF
2. **API Key Authentication** - Secret-based access control
3. **Rate Limiting** - Per-IP request throttling
4. **VPC Network** - Isolated network environment
5. **Firewall Rules** - Controlled access ports
6. **IAM** - Least-privilege service accounts
7. **Secret Manager** - Encrypted API key storage

## 🔐 Authentication & Authorization

### API Key Management

API keys are stored securely in Google Secret Manager and loaded at runtime.

#### View Your API Key

```bash
# Get the default API key
terraform output -raw api_key

# Or view directly from Secret Manager
gcloud secrets versions access latest --secret="ltx-video-api-keys"
```

#### Add New API Keys

1. **Get current keys:**

```bash
gcloud secrets versions access latest --secret="ltx-video-api-keys" > keys.json
```

1. **Edit keys.json:**

```json
{
  "keys": [
    {
      "key": "existing-key-12345",
      "name": "default-key",
      "enabled": true,
      "rate_limit": {
        "requests_per_minute": 60
      }
    },
    {
      "key": "new-key-67890",
      "name": "production-key",
      "enabled": true,
      "rate_limit": {
        "requests_per_minute": 100
      }
    }
  ]
}
```

1. **Update secret:**

```bash
gcloud secrets versions add ltx-video-api-keys --data-file=keys.json
```

1. **Restart service to reload keys:**

```bash
gcloud compute ssh ltx-video-vm --zone=us-central1-a \
  --command="sudo systemctl restart ltx-video"
```

#### Revoke an API Key

Set `"enabled": false` in keys.json and update:

```json
{
  "key": "compromised-key",
  "name": "old-key",
  "enabled": false
}
```

#### Generate Secure API Keys

```bash
# Generate a 32-character random key
openssl rand -base64 32

# Or use Python
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Using API Keys

#### cURL Example

```bash
curl -X POST http://LOAD_BALANCER_IP/predict \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A serene lake at sunset",
    "num_frames": 121
  }'
```

#### Python Example

```python
import requests

headers = {
    "X-API-Key": "YOUR_API_KEY",
    "Content-Type": "application/json"
}

response = requests.post(
    "http://LOAD_BALANCER_IP/predict",
    headers=headers,
    json={"prompt": "A cat playing piano", "num_frames": 121}
)

print(response.json())
```

#### Node.js Example

```javascript
const axios = require('axios');

const response = await axios.post(
  'http://LOAD_BALANCER_IP/predict',
  {
    prompt: 'A robot dancing',
    num_frames: 121
  },
  {
    headers: {
      'X-API-Key': 'YOUR_API_KEY',
      'Content-Type': 'application/json'
    }
  }
);

console.log(response.data);
```

### Disable Authentication (Not Recommended)

For testing only:

```hcl
# terraform.tfvars
enable_authentication = false
```

Then apply:

```bash
terraform apply
```

## 🛡️ Cloud Armor Configuration

### Current Protection Rules

1. **Rate Limiting** (Priority 1000)
   - Limit: 100 requests/minute per IP (configurable)
   - Action: Ban for 10 minutes after exceeding
   - Response: HTTP 429 (Too Many Requests)

2. **XSS Protection** (Priority 3000)
   - Detects cross-site scripting attempts
   - Action: Block with HTTP 403

3. **SQL Injection Protection** (Priority 3001)
   - Detects SQL injection patterns
   - Action: Block with HTTP 403

4. **Local File Inclusion** (Priority 3002)
   - Detects LFI attack patterns
   - Action: Block with HTTP 403

5. **Remote Code Execution** (Priority 3003)
   - Detects RCE attempts
   - Action: Block with HTTP 403

6. **Tor Exit Node Blocking** (Priority 2000)
   - Blocks traffic from known Tor exit nodes
   - Action: Block with HTTP 403

7. **Country Blocking** (Priority 4000+)
   - Block specific countries (optional)
   - Configurable in terraform.tfvars

8. **IP Whitelisting** (Priority 100+)
   - Allow specific IPs to bypass all rules
   - Configurable in terraform.tfvars

9. **Adaptive Protection**
   - Machine learning-based Layer 7 DDoS defense
   - Automatically enabled

### Adjust Rate Limiting

```hcl
# terraform.tfvars
rate_limit_requests_per_minute = 60  # Change from 100 to 60
```

Apply changes:

```bash
terraform apply
```

### Block Specific Countries

```hcl
# terraform.tfvars
blocked_countries = ["CN", "RU", "KP", "IR"]
```

Uses ISO 3166-1 alpha-2 country codes.

### Whitelist Your Office IP

```hcl
# terraform.tfvars
whitelisted_ip_ranges = [
  "YOUR_OFFICE_IP/32",
  "YOUR_HOME_IP/32"
]
```

Whitelisted IPs bypass ALL Cloud Armor rules including rate limiting.

### View Cloud Armor Logs

```bash
# View blocked requests
gcloud logging read "resource.type=http_load_balancer AND jsonPayload.enforcedSecurityPolicy.name=ltx-video-armor-policy" --limit=50

# View by action
gcloud logging read "jsonPayload.enforcedSecurityPolicy.outcome=DENY" --limit=50
```

Or in Console:
<https://console.cloud.google.com/net-security/securitypolicies>

### Test Rate Limiting

```bash
# Rapid fire requests to trigger rate limit
for i in {1..150}; do
  curl -X POST http://LOAD_BALANCER_IP/health \
    -H "X-API-Key: YOUR_KEY" &
done
wait

# After ~100 requests, you should see:
# HTTP 429 - Too Many Requests
```

## 🔒 Network Security

### Firewall Rules

Current rules allow:

- **SSH (port 22):** From `0.0.0.0/0` (change this!)
- **HTTP (port 80, 8080):** From `0.0.0.0/0`
- **Health checks:** From GCP health check IPs

#### Restrict SSH Access

```hcl
# terraform.tfvars
ssh_source_ranges = ["YOUR_IP/32"]
```

Or use Cloud IAP (recommended):

1. **Remove external IP:**

```hcl
# In main.tf, comment out access_config block
network_interface {
  subnetwork = google_compute_subnetwork.ltx_subnet.id
  # access_config {
  #   nat_ip = google_compute_address.ltx_vm_ip.address
  # }
}
```

1. **SSH via IAP:**

```bash
gcloud compute ssh ltx-video-vm \
  --zone=us-central1-a \
  --tunnel-through-iap
```

#### Restrict API Access

Limit to your application servers only:

```hcl
# terraform.tfvars
http_source_ranges = ["YOUR_APP_SERVER_IP/32"]
```

### VPC Service Controls (Advanced)

For maximum security, enable VPC Service Controls:

```bash
gcloud access-context-manager policies create \
  --title="LTX Video Policy"

gcloud access-context-manager perimeters create ltx-video-perimeter \
  --title="LTX Video Perimeter" \
  --resources=projects/PROJECT_NUMBER \
  --restricted-services=storage.googleapis.com
```

## 📊 Monitoring & Alerts

### Set Up Security Alerts

#### Budget Alerts (Detect Abuse)

```bash
gcloud billing budgets create \
  --billing-account=BILLING_ACCOUNT_ID \
  --display-name="LTX Video Budget Alert" \
  --budget-amount=1000 \
  --threshold-rule=percent=50 \
  --threshold-rule=percent=90 \
  --threshold-rule=percent=100
```

#### Failed Authentication Alert

```bash
# Create log-based metric
gcloud logging metrics create failed_auth \
  --description="Failed API authentication attempts" \
  --log-filter='resource.type="gce_instance" AND jsonPayload.message=~"Invalid API key"'

# Create alert policy
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="Failed Auth Alert" \
  --condition-threshold-value=10 \
  --condition-threshold-duration=300s
```

#### Rate Limit Alert

```bash
gcloud logging metrics create rate_limit_exceeded \
  --description="Rate limit exceeded events" \
  --log-filter='jsonPayload.enforcedSecurityPolicy.outcome="DENY" AND jsonPayload.enforcedSecurityPolicy.name="ltx-video-armor-policy"'
```

### View Security Metrics

```bash
# Authentication failures
gcloud logging read 'jsonPayload.message=~"Invalid API key"' --limit=100

# Rate limit hits
gcloud logging read 'jsonPayload.enforcedSecurityPolicy.outcome="DENY"' --limit=100

# Successful requests
gcloud logging read 'resource.type="gce_instance" AND "Authenticated request"' --limit=100
```

## 🔍 Incident Response

### Suspected Compromised API Key

1. **Immediately revoke the key:**

```bash
# Edit keys.json to set enabled: false
gcloud secrets versions add ltx-video-api-keys --data-file=keys.json
```

1. **Restart service:**

```bash
gcloud compute ssh ltx-video-vm --zone=us-central1-a \
  --command="sudo systemctl restart ltx-video"
```

1. **Check usage:**

```bash
# Review logs for that key
gcloud logging read 'jsonPayload.metadata.user="compromised-key-name"' \
  --format=json --limit=1000 > usage.json
```

1. **Generate new key and notify legitimate users**

### DDoS Attack

Cloud Armor adaptive protection automatically mitigates, but you can:

1. **Check Cloud Armor dashboard:**
<https://console.cloud.google.com/net-security/securitypolicies>

2. **Enable ban for attacking IPs:**

```bash
# Get attacking IPs
gcloud logging read 'jsonPayload.enforcedSecurityPolicy.outcome="DENY"' \
  --format="value(jsonPayload.remoteIp)" | sort | uniq -c | sort -nr

# Manually block IP
gcloud compute security-policies rules create 500 \
  --security-policy=ltx-video-armor-policy \
  --src-ip-ranges="ATTACKER_IP/32" \
  --action=deny-403
```

### Unauthorized Access to VM

1. **Stop the VM immediately:**

```bash
gcloud compute instances stop ltx-video-vm --zone=us-central1-a
```

1. **Take disk snapshot:**

```bash
gcloud compute disks snapshot ltx-video-vm \
  --snapshot-names=incident-snapshot-$(date +%Y%m%d) \
  --zone=us-central1-a
```

1. **Review logs:**

```bash
gcloud logging read 'resource.type="gce_instance"' \
  --freshness=24h > incident-logs.txt
```

1. **Rotate all credentials:**

- API keys
- Service account keys
- SSH keys

## 🔐 Best Practices Checklist

### Initial Setup

- [ ] Change SSH source range to your IP only
- [ ] Generate strong API keys (32+ characters)
- [ ] Enable authentication (`enable_authentication = true`)
- [ ] Review and adjust rate limits
- [ ] Set up budget alerts
- [ ] Configure blocked countries if needed

### Regular Maintenance

- [ ] Rotate API keys every 90 days
- [ ] Review Cloud Armor logs weekly
- [ ] Check for OS/package updates monthly
- [ ] Audit IAM permissions quarterly
- [ ] Test incident response procedures

### Production Deployment

- [ ] Use private IPs with Cloud VPN/Interconnect
- [ ] Enable VPC Service Controls
- [ ] Set up centralized logging (SIEM)
- [ ] Configure automated security scanning
- [ ] Implement API key rotation automation
- [ ] Set up PagerDuty/alerting
- [ ] Document security procedures
- [ ] Conduct security audit

### Compliance

- [ ] Enable audit logging
- [ ] Implement data retention policies
- [ ] Document data flows
- [ ] Review third-party dependencies
- [ ] Ensure GDPR/CCPA compliance if applicable

## 📚 Additional Resources

- [Cloud Armor Documentation](https://cloud.google.com/armor/docs)
- [Secret Manager Best Practices](https://cloud.google.com/secret-manager/docs/best-practices)
- [VPC Security Best Practices](https://cloud.google.com/vpc/docs/best-practices)
- [GCP Security Command Center](https://cloud.google.com/security-command-center)

## 🆘 Support

For security concerns:

- **Non-critical:** Review logs and monitoring dashboards
- **Critical:** Stop VM, take snapshot, contact your security team
- **GCP Security:** <https://cloud.google.com/security/report-vulnerability>
