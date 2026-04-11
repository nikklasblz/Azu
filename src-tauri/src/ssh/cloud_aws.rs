use aws_sdk_lightsail::types::Instance;
use crate::ssh::types::SshHostConfig;

pub async fn discover_lightsail_instances() -> Result<Vec<SshHostConfig>, String> {
    let config = aws_config::load_defaults(aws_config::BehaviorVersion::latest())
        .await;

    let client = aws_sdk_lightsail::Client::new(&config);

    let resp = client.get_instances()
        .send()
        .await
        .map_err(|e| format!("AWS Lightsail API error: {}", e))?;

    let mut hosts = Vec::new();

    for inst in resp.instances() {
        let inst: &Instance = inst;

        let name = inst.name().unwrap_or("unnamed").to_string();
        let state = inst.state()
            .and_then(|s: &aws_sdk_lightsail::types::InstanceState| s.name())
            .unwrap_or_default();

        // Skip non-running instances
        if state != "running" {
            continue;
        }

        // Skip instances without public IP
        let ip = match inst.public_ip_address() {
            Some(ip) => ip.to_string(),
            None => continue,
        };

        let region = inst.location()
            .and_then(|l: &aws_sdk_lightsail::types::ResourceLocation| l.region_name())
            .map(|r: &aws_sdk_lightsail::types::RegionName| r.as_str().to_string())
            .unwrap_or_default();

        hosts.push(SshHostConfig {
            id: format!("aws-lightsail-{}", name),
            name: name.clone(),
            host: ip,
            port: 22,
            user: "ubuntu".to_string(),
            identity_file: None,
            tags: Some(vec!["aws".into(), "lightsail".into(), region]),
            source: "aws-lightsail".to_string(),
        });
    }

    Ok(hosts)
}
