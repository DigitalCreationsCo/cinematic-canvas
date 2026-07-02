# =============================================================================
# NLB Module — Network Load Balancer for QUIC/gRPC Traffic
# =============================================================================
#
# Network Load Balancer for Lore QUIC (UDP) and gRPC (TCP) traffic:
# - TCP:41337 → Lore TCP (port 41337)
# - UDP:41337 → Lore UDP (port 41337)
#
# Uses cross-zone load balancing for single-node topology compatibility.
# UDP health checks use TCP on port 41339 (Lore HTTP) since NLB doesn't
# support UDP health checks directly.
#
# =============================================================================

# ---------------------------------------------------------------------------
# Security Group — NLB
# ---------------------------------------------------------------------------
resource "aws_security_group" "nlb" {
  name_prefix = "${var.environment}-portals-nlb-"
  description = "Allow inbound TCP/UDP from internet"
  vpc_id      = var.vpc_id

  # TCP from internet
  ingress {
    description = "TCP from internet"
    from_port   = 41337
    to_port     = 41337
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # UDP from internet
  ingress {
    description = "UDP from internet"
    from_port   = 41337
    to_port     = 41337
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Egress to ECS tasks
  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-nlb-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# ---------------------------------------------------------------------------
# Network Load Balancer
# ---------------------------------------------------------------------------
resource "aws_lb" "main" {
  name               = "${var.environment}-portals-nlb"
  internal           = false
  load_balancer_type = "network"
  security_groups    = [aws_security_group.nlb.id]
  subnets            = var.public_subnet_ids

  enable_cross_zone_load_balancing = true

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-nlb"
  })
}

# ---------------------------------------------------------------------------
# Target Groups
# ---------------------------------------------------------------------------
resource "aws_lb_target_group" "tcp" {
  name        = "${var.environment}-portals-lore-tcp"
  port        = 41337
  protocol    = "TCP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    port                = 41337
    protocol            = "TCP"
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-lore-tcp-tg"
  })
}

resource "aws_lb_target_group" "udp" {
  name        = "${var.environment}-portals-lore-udp"
  port        = 41337
  protocol    = "UDP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  # UDP health checks use TCP on HTTP port (NLB limitation)
  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    port                = 41339
    protocol            = "TCP"
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-lore-udp-tg"
  })
}

# ---------------------------------------------------------------------------
# Listeners
# ---------------------------------------------------------------------------
# TCP Listener
resource "aws_lb_listener" "tcp" {
  load_balancer_arn = aws_lb.main.arn
  port              = 41337
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.tcp.arn
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-nlb-tcp"
  })
}

# UDP Listener
resource "aws_lb_listener" "udp" {
  load_balancer_arn = aws_lb.main.arn
  port              = 41337
  protocol          = "UDP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.udp.arn
  }

  tags = merge(var.tags, {
    Name = "${var.environment}-portals-nlb-udp"
  })
}
