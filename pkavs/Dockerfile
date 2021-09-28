# Based on: https://docs.aws.amazon.com/lambda/latest/dg/images-create.html#images-create-1


# Lint and test

FROM ubuntu

WORKDIR /build

RUN apt update && apt install -y wget gnupg
RUN wget -O - https://nightly.odoo.com/odoo.key | apt-key add -
RUN echo "deb http://nightly.odoo.com/13.0/nightly/deb/ ./" >> /etc/apt/sources.list.d/odoo.list
RUN apt-get update

# https://serverfault.com/a/992421/130018
RUN DEBIAN_FRONTEND="noninteractive" TZ="Europe/London" apt-get install -y odoo postgresql

ENTRYPOINT [ "sh", "-c", "odoo"]
