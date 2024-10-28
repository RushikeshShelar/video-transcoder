import { ContainerInstanceManagementClient } from "@azure/arm-containerinstance"
import { DefaultAzureCredential } from "@azure/identity";

import { v4 as uuidv4 } from 'uuid';

const AZURE_SUBSCRIPTION_ID = process.env.AZURE_SUBSCRIPTION_ID || "";
const RESOURCE_GRP_NAME = process.env.RESOURCE_GRP_NAME || "";
const CONTAINER_GRP_NAME = process.env.CONTAINER_GRP_NAME || "";
const ACR_NAME = process.env.ACR_NAME || "transcoder";
const ACR_USERNAME = process.env.ACR_USERNAME || "";
const ACR_PASSWORD = process.env.ACR_PASSWORD || "";

export async function spinContainer(bucketName: string, key: string) {
    const credentials = new DefaultAzureCredential();
    const client = new ContainerInstanceManagementClient(credentials, AZURE_SUBSCRIPTION_ID);

    // unique Conntaienr GRP name
    const containerGroupName = `transcoder-${uuidv4()}`;


    const containerGroup = {
        location: "southindia",
        containers: [
            {
                name: "transcoder-container",
                image: `${ACR_NAME}.azurecr.io/transcoder-image:latest`,
                resources: {
                    requests: {
                        cpu: 1,
                        memoryInGB: 1.5,
                    },
                },
                environmentVariables: [
                    { name: "BUCKET_NAME", value: bucketName },
                    { name: "KEY", value: key },
                    { name: "OUTPUT_BUCKET_NAME", value: process.env.OUTPUT_BUCKET_NAME },
                ],
            }
        ],
        imageRegistryCredentials: [
            {
                server: `${ACR_NAME}.azurecr.io`,
                username: ACR_USERNAME,
                password: ACR_PASSWORD
            }
        ],
        osType: "Linux",
        restartPolicy: "Never",
    }

    try {
        console.log(`Creating container group: ${containerGroupName}`);
        const result = await client.containerGroups.beginCreateOrUpdate(RESOURCE_GRP_NAME, containerGroupName, containerGroup);

        // Wait for the container group to be created
        await result.pollUntilDone();
        console.log('Container group deployment completed');

        // Monitor Container Group status
        const checkContainerStatus = async () => {
            const containerGroup = await client.containerGroups.get(RESOURCE_GRP_NAME, containerGroupName);

            if (!containerGroup.containers || !containerGroup.containers[0]) {
                console.log("Container not found");
                return;
            }

            const container = containerGroup.containers[0];

            if (container.instanceView?.currentState?.state === "Terminated") {
                console.log(`Container ${containerGroupName} has completed its task`);

                // Delete the Containers
                try {
                    await client.containerGroups.beginDelete(RESOURCE_GRP_NAME, containerGroupName);
                    console.log(`Cleaned up container group ${containerGroupName}`);
                } catch (error) {
                    console.log("Container group already deleted or cleanup failed:", error);
                }
                return;
            }
            setTimeout(checkContainerStatus, 30000);
        };
        // If container is still running, check again in 30 seconds

        await checkContainerStatus();

    } catch (error) {
        console.error("Error managing container group:", error);
        throw error;
    }
}