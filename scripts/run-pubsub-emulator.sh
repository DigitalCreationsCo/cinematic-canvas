#!/bin/bash
docker run -p 8085:8085 --rm -ti gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators gcloud beta emulators pubsub start --host-port=0.0.0.0:8085